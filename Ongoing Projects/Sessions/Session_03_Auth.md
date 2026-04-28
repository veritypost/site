# Session 3 — Auth + Account + Email + Login UI

**Self-contained operating manual.** Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — everything you need to ship Session 3 lives here. Do not look elsewhere for source-of-truth.

---

## 0. Preamble — How to operate this session

### 0.1 Hermetic guarantee

Session 3 owns the listed file paths and **only** the listed file paths. Any fix that requires editing a file outside this list is **deferred** and flagged for the owning session. No exceptions, no "small one-line fix in S5 territory because it's faster." Cross-session contamination breaks the parallel-execution model that justifies the 10-session split.

If you discover an off-domain edit is required to ship an item, do this and stop:
1. Add a `**Hand-off:**` note to the item describing the exact file + line + change.
2. Tag the receiving session in the note (e.g., `Hand-off: S5 — web/src/app/api/comments/[id]/route.js:88, drop the now-dead requires_verified gate`).
3. Mark the item `🟨 BLOCKED on Sx` in this file.
4. Move on to the next item.

### 0.2 Owned paths (strict)

```
web/src/app/api/auth/**
web/src/app/api/account/**
web/src/app/api/access-request/**
web/src/app/api/access-redeem/**
web/src/middleware.js
web/src/lib/auth.js
web/src/lib/email.js
web/src/lib/betaApprovalEmail.ts
web/src/lib/accessRequestEmail.ts
web/src/lib/apiErrors.js
web/src/lib/siteUrl.js
web/src/lib/rateLimits.ts            (NEW — Session 3 creates)
web/src/lib/cors.js                  (NEW — Session 3 creates)
web/src/app/login/**
web/src/app/signup/**                (rewrite from redirect to real route per Q2c)
web/src/app/forgot-password/**
web/src/app/verify-email/**
```

Existing API endpoints under `web/src/app/api/auth/` as of 2026-04-27:

```
callback/             check-email/          check-username/       email-change/
graduate-kid/         login/                login-failed/         login-precheck/
logout/               resend-verification/  reset-password/       resolve-username/
signup/               signup-rollback/      verify-password/
```

Under `/api/account/`: `data-export/`, `delete/`, `login-cancel-deletion/`, `onboarding/`.

After Q2 ships, the auth route surface collapses to roughly: `callback/`, `check-username/`, `email-change/`, `graduate-kid/`, `logout/`, `send-magic-link/` (NEW). The rest are deleted. See § 2 for the exact migration map.

### 0.3 Multi-agent shipping process (mandatory for every item)

Per memory `feedback_4pre_2post_ship_pattern` + `feedback_genuine_fixes_not_patches`. Every item below — even the one-line copy fixes — ships through this gauntlet. The auth surface is the single most security-sensitive territory in the product; cutting corners here is non-negotiable.

**Pre-implementation (4 agents, fan out in parallel):**

1. **Investigator** — read the current code at the cited file:line. Quote the actual function body / surrounding lines. Confirm the audit claim is still true (memory `feedback_verify_audit_claims_against_current_code`: ~5/35 items per session are stale or already fixed). If the claim is stale, mark the item ✅ STALE and skip the rest of the process.
2. **Planner** — design the change. Name every file edited, every export added/removed, every caller that must update. If the plan exceeds the owned-paths list, defer per § 0.1.
3. **Big-picture reviewer** — cross-file impact analysis. Auth changes ripple through middleware, every authed route, every iOS caller, every email template. Surface the ripples; don't just review the immediate diff.
4. **Independent adversary** — actively look for ways the plan breaks. Race conditions, RLS bypasses, enumeration oracles, timing attacks, CSRF holes, JWT confusion attacks. The adversary's job is to be wrong; if they find nothing, the plan goes through. If they find something real, the plan iterates.

All four must reach 4/4 unanimous before implementation begins. Per memory `feedback_divergence_resolution_4_independent_agents`: when the four diverge on a finding, dispatch four fresh independent agents on the disputed point (no shared context); the verdict of the second round decides. Don't bring auth-internal disputes to the owner — figure them out.

**Implementation (N implementers in parallel, isolated file ownership):**

Per memory `feedback_batch_mode_4_parallel_implementers`. When a single item touches multiple files, split the files across parallel implementer agents — each owns a strict subset, no two implementers touch the same file. One planner + N implementers + reviewer is the right shape. For elevated-care items (anything touching JWTs, RBAC, the kid surface, or session lifecycle), add a security/correctness reviewer pass.

**Post-implementation (2 reviewers):**

1. **Independent code reviewer** — diff vs main, lint-pass clean, types coherent, callers updated, no orphaned imports, no dead code paths preserved as comments. Memory `feedback_genuine_fixes_not_patches`: kill the thing being replaced; no parallel paths; no TODOs/HACKs.
2. **Security/correctness reviewer** — for every item in this session this is mandatory. Auth + account + middleware + JWT verification all sit in this category. Reviewer probes: can the plan be turned into an enumeration oracle? Can it be raced? Can a malformed input crash the handler? Can a kid JWT slip through? Can the rate-limit be evaded by reusing a session? When unsure: write the test, run the test.

**Verification authority.** After post-impl review, the implementer runs the verification block specified per item below. Verification commands return non-zero or a specific grep must show zero hits — the implementer reports the actual command output, not a paraphrase. Memory `feedback_understand_before_acting`: read the code, trace the callers, check DB schema via MCP before declaring done.

### 0.4 Genuine fixes, never patches

Memory `feedback_genuine_fixes_not_patches`. Every item below gets full integration. Specifically:

- **Kill the thing being replaced.** When `/api/auth/check-email` is dropped, no caller is left referencing it. The route file is deleted, the call site in the signup form is deleted, the rate-limit policy row in the DB is deleted (or audit-logged for archival per the migration), and the README/tests/comments referencing it are deleted.
- **No parallel paths.** Magic-link replaces password signup. Don't ship a feature flag that keeps both alive "just in case." Q4 already locked the decision; the implementation matches. If a parallel path is genuinely needed for a staged rollout, the path lives behind a single env-var switch with a documented removal date — not a permanent toggle.
- **No `TODO` / `HACK` / `FIXME` / force-unwrap-as-crutch.** If a tradeoff has to land, surface it explicitly in the commit body and add it to a deferred-cleanup list at the bottom of this manual under § 6.
- **Types + callers + data flow coherent.** A change to `requireAuth`'s signature ripples through every authed route. The commit ships every caller updated, not just the lib.

### 0.5 Verification authority

The completion checklist at § 7 is the ground truth. An item is not shipped until the verification block passes. The implementer is the verifier. Reports are command outputs, not paraphrases. If the verification command's grep shows a hit, the implementer fixes the hit before claiming green.

### 0.6 Status legend

- 🟦 = open
- 🟧 = owner decision pending (none in this session — Q4 locked all owner-asks)
- 🟨 = depends on peer session — listed but waits
- 🟩 = shipped (commit hash recorded inline when done)
- 🟥 = blocked (reason inline)
- ✅ STALE = audit claim no longer true; verified during investigator pass

### 0.7 Commit tagging

All Session 3 commits tag `[S3-Tnnn]` or `[S3-Q2x]`. Examples: `[S3-A129] add lib/rateLimits.ts`, `[S3-Q2-a] add /api/auth/send-magic-link route`. Multi-item commits (rare) tag the umbrella: `[S3-Q2]`. After a commit lands, mark the corresponding item 🟩 in this file with the short SHA.

### 0.8 Order of execution

The umbrella item **S3-Q2 (magic-link AUTH-MIGRATION)** dominates this session. Most subsidiary items (A108, A111, A112, A48, A99, Q1b-AUTH) collapse into Q2 or become moot under it. The recommended order:

1. **Foundation libs first.** Ship `lib/rateLimits.ts` (S3-A129) and `lib/cors.js` (S3-A128). Several Q2 sub-items depend on them.
2. **Privacy/correctness sweep.** Ship A72 (`truncateIpV4`), A127 (site URL fallback), A10 (account/delete sessions revoke). These are independent of Q2 and clear faster.
3. **Q2 main pass.** Ship Q2-a/b/c/d (new send-magic-link route, drop oracles, real /signup, graduate-kid hardening). This is the biggest single block.
4. **Q2 cleanup pass.** Ship Q2-e/f/g (pick-username flow, iOS contract published for S9, soft-delete forgot-password). Q2-h is owner-side dashboard work — flag and skip.
5. **Q3b coordination.** Middleware kid-blind fix + `kindAllowed` param. Wait for S1's RPC kid-rejects + S10's kids/pair issuer flip to be ready before merging. Build the diff in a branch; co-ship.
6. **Q1b-AUTH dropoff.** Wait for S1's `requires_verified` column drop migration. Then drop the resolver branch. Marking moot items (A108, A111, A48 if Q2-g landed first) along the way.

---

## 1. Foundation libraries (ship first)

### S3-A129 — Centralized rate-limit constants 🟩 fc5a88e

**Source:** TODO_READ_ONLY_HISTORICAL.md A129. ~40 routes across the app hardcode `windowSec: 3600` (and matching `'Retry-After': '3600'` headers) inline. No central config; a policy change requires a 40-file edit. Drift risk: one route hardcodes 1800 instead of 3600 and creates inconsistent UX where users get throttled differently across surfaces.

**Severity:** HIGH — maintainability + drift risk on a security-relevant surface. Audit items A24 (graduate-kid no rate limit) and A25 (auth enumeration oracles) both touch this surface; fixing those individually without a central config creates more drift.

**Status:** 🟦 open. Foundation lib — ship first.

**File:** Create `web/src/lib/rateLimits.ts`.

**Current state:** No central config exists. Examples of inline hardcodes (sampling, not exhaustive):

- `web/src/app/api/auth/check-email/route.js` — `windowSec: 3600` (route slated for deletion under Q2b).
- `web/src/app/api/auth/check-username/route.js` — `windowSec: 3600` (route collapses to session-scoped under Q2b).
- `web/src/app/api/auth/graduate-kid/claim/route.ts` — currently no rate limit at all (audit A24).
- Comment + vote routes under S5 ownership also hardcode windows; S5 will import from the new lib once it exists.

**Fix.** Create `web/src/lib/rateLimits.ts` with the named constants below. Migrate every auth + account route in S3 ownership to import from here. Other sessions migrate their own callers; S3's job is to publish the lib + migrate S3's own files.

```ts
// web/src/lib/rateLimits.ts
//
// Centralized rate-limit policy. Every API route's rate-limit window/cap
// pair lives here as a named constant. Direct literals (`windowSec: 3600`)
// in route files are forbidden — drift across 40+ endpoints is the exact
// failure mode this lib exists to prevent.
//
// Key naming convention: <DOMAIN>_<ACTION>_<SCOPE>. Scope is one of
// PER_IP, PER_EMAIL, PER_SESSION, PER_USER, PER_TOKEN. Always explicit.
//
// Adding a new key: add it here, import from the route. Do not inline a
// new literal even for a one-off route — the next agent will copy the
// pattern and the drift starts again.

export interface RateLimitPolicy {
  /** Window in seconds. */
  windowSec: number;
  /** Max attempts within the window. */
  maxAttempts: number;
}

export const RATE_LIMITS: Record<string, RateLimitPolicy> = {
  // === Auth ===

  // Magic-link send. Per email, 3/hour. Returning generic body always
  // (Q2b oracle-collapse), so the cap is a soft denial — message stays
  // identical, internal log captures the cap event.
  AUTH_MAGIC_LINK_SEND_PER_EMAIL: { windowSec: 3600, maxAttempts: 3 },

  // Pick-username availability check. Per session, 30/minute. Anonymous
  // calls 401 — the cap only applies to authed sessions in the
  // post-signin pick-username flow. Abusers spinning fresh sessions hit
  // the per-IP signup cap first.
  AUTH_USERNAME_CHECK_PER_SESSION: { windowSec: 60, maxAttempts: 30 },

  // Per-IP signup submit. Combined with per-email, makes enumeration
  // uneconomic. 5/hour is loose enough for legitimate retry, tight
  // enough to prevent automated probing.
  AUTH_SIGNUP_SUBMIT_PER_IP: { windowSec: 3600, maxAttempts: 5 },

  // Graduation claim — per-IP cap. 10/hour is permissive enough for a
  // kid retrying on a flaky connection.
  AUTH_GRADUATE_CLAIM_IP: { windowSec: 3600, maxAttempts: 10 },

  // Graduation claim — per-token cap. Prevents focused brute force on
  // a single guessed token. 5/min is tight; a real kid retrying within
  // a minute is rare.
  AUTH_GRADUATE_CLAIM_TOKEN: { windowSec: 60, maxAttempts: 5 },

  // === Comments / votes (S5 imports — declared here for shared config) ===

  COMMENT_POST_PER_USER: { windowSec: 60, maxAttempts: 10 },
  COMMENT_VOTE_PER_USER: { windowSec: 60, maxAttempts: 30 },
};

/**
 * Helper: read a policy by key with a fail-loud miss. Use this in route
 * handlers instead of `RATE_LIMITS[key]` so a typo throws at boot rather
 * than silently disabling the rate limit.
 */
export function getRateLimit(key: keyof typeof RATE_LIMITS): RateLimitPolicy {
  const policy = RATE_LIMITS[key];
  if (!policy) {
    throw new Error(`RATE_LIMITS missing key: ${String(key)}`);
  }
  return policy;
}
```

**Why.** One edit point. CI lint rule (out-of-scope follow-up; flag for the build-tooling sweep) blocks raw `windowSec: \d+` literals outside `lib/rateLimits.ts`. Other sessions' routes can import too — S5 specifically needs `COMMENT_POST_PER_USER` / `COMMENT_VOTE_PER_USER` for items in its scope.

**Dependencies.** None. Ships standalone.

**Verification.**
1. `grep -rnE "windowSec:\s*\d+" web/src/app/api/auth web/src/app/api/account` returns zero hits after migration.
2. `grep -rn "from.*lib/rateLimits" web/src/app/api/auth web/src/app/api/account` returns at least one hit per migrated route.
3. `npm run typecheck` passes (verifies the `keyof typeof` helper accepts every consumer's key).
4. Smoke test: hit `/api/auth/send-magic-link` 4 times in an hour from one email → 4th call returns generic 200 (no rate-limit error in body), and `rate_limit_events` row appears with the policy key.

**Multi-agent shipping process.** Standard 4 pre + 2 post per § 0.3. Adversary explicitly probes: typo'd keys at call sites (TypeScript catches), missing keys at runtime (helper throws), new key added without bumping consumers (planner enforces in the PR description).

---

### S3-A128 — CORS allowlist consolidation 🟩 0327664

**Source:** TODO_READ_ONLY_HISTORICAL.md A128. Two endpoints redefine `isAllowedOrigin()` with hardcoded origin lists; middleware has the canonical list also hardcoded. Three places must update if prod URL ever changes.

**Severity:** MEDIUM — single source of truth violation on a security-relevant surface. Account-deletion paths shouldn't have inconsistent CORS — a misaligned origin between middleware and the route handlers leaves a window where a request passes one check but trips the other.

**Status:** 🟦 open. Foundation lib — ship right after A129.

**File:** Create `web/src/lib/cors.js`.

**Current state.**
- `web/src/middleware.js:169-174` — canonical inline list.
- `web/src/app/api/account/delete/route.js:32-36` — separate inline copy.
- `web/src/app/api/account/login-cancel-deletion/route.js` — third inline copy.

**Fix.** Extract `web/src/lib/cors.js` exporting `ALLOWED_ORIGINS` and `isAllowedOrigin()`. Refactor all three callers to import.

```js
// web/src/lib/cors.js
//
// Single source of truth for browser-CORS allow-list. The list is
// hardcoded — do NOT trust env vars for credentialed CORS, even
// preview-deploy origins. Add preview origins explicitly when needed.
//
// Native iOS clients use Authorization-header bearers and have no
// browser-enforced CORS; this allow-list does not affect them.
//
// Consumers as of 2026-04-27:
//   - web/src/middleware.js (top-level applyCors + preflight short-circuit)
//   - web/src/app/api/account/delete/route.js (DELETE preflight)
//   - web/src/app/api/account/login-cancel-deletion/route.js (POST preflight)

export const ALLOWED_ORIGINS = new Set([
  'https://veritypost.com',
  'https://www.veritypost.com',
  'http://localhost:3000',
  'http://localhost:3333',
]);

export const CORS_ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
export const CORS_ALLOW_HEADERS =
  'authorization, content-type, x-health-token, x-request-id, x-vercel-cron';

/**
 * Returns true when `origin` is in the credentialed allow-list. Returns
 * false for null/undefined/empty origins (server-to-server / same-origin
 * requests don't need CORS at all).
 */
export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  return ALLOWED_ORIGINS.has(origin);
}
```

**Refactor:**
- `web/src/middleware.js:169-174` — drop the inline `ALLOWED_ORIGINS` and inline `applyCors` allow-list check; keep `applyCors` itself (it sets headers) but call `isAllowedOrigin(origin)` from the lib.
- `web/src/app/api/account/delete/route.js` — drop the inline copy at `:32-36`; import `isAllowedOrigin` from `lib/cors`.
- `web/src/app/api/account/login-cancel-deletion/route.js` — same pattern.

**Why.** Prevents three-place drift; single edit point for env-driven preview deploys later.

**Dependencies.** None.

**Verification.**
1. `grep -rn "ALLOWED_ORIGINS\|isAllowedOrigin" web/src/` shows the lib file as the only definition + the importers (middleware + 2 account routes).
2. `grep -rn "veritypost\.com" web/src/middleware.js web/src/app/api/account/delete/route.js web/src/app/api/account/login-cancel-deletion/route.js` returns zero hits (the strings now live only in `lib/cors.js`).
3. Smoke test: cross-origin OPTIONS preflight to `/api/account/delete` from `https://veritypost.com` → 204 with `Access-Control-Allow-Origin` echoed back. Same from `https://evil.example.com` → 204 with no allow-origin header (browser blocks).

**Multi-agent shipping process.** Standard 4 pre + 2 post. Adversary specifically probes: did the refactor preserve the `Access-Control-Allow-Credentials: true` semantics? Did the `Vary: Origin` append survive? Does the preflight short-circuit still emit `CORS_ALLOW_METHODS` / `CORS_ALLOW_HEADERS`?

---

## 2. Q2 — Magic-link AUTH-MIGRATION (umbrella)

🟦 **Source:** OWNER-ANSWERS_READ_ONLY_HISTORICAL.md Q2 — locked. Pre-authorized by Q4 best-practice locks where applicable.

**Headline decision (locked, full quote from owner-answers Q2):**

> Magic-link is the only auth path for web and iOS. Apple Sign-In + Google Sign-In are hidden (not deleted — launch-time kill-switch per the `feedback_launch_hides` rule). Email + password signup is removed entirely.

**Why magic-link:**
- Removes an entire class of bugs: password-attempt lockout, username-availability race, signup retry loop on username trigger errors, OAuth callback merge logic.
- Anti-abuse signal that's roughly equivalent to email verification (you have to own the inbox to log in).
- Aligns with Q1b banner-only verification stance — verification IS the signin.
- Reduces the iOS auth contract to ~30 lines of code (vs the current 600+ in `AuthViewModel.swift` covering OAuth + password + lockout + retry).

**Risk:** Medium-high. Auth touches every entry path. Recommended approach: build behind a feature flag, ship to staging, smoke-test full signup → username-pick → home flow on web + iOS, then flip in production.

**Files (in scope):** all under `web/src/app/api/auth/`, `web/src/middleware.js`, `web/src/lib/auth.js`, plus the four UI page directories under `web/src/app/login/`, `signup/`, `forgot-password/`, `verify-email/`.

**Coordination with peers:**
- **S9 (iOS Adult)** consumes the API contract for `/api/auth/send-magic-link`; S3 publishes the contract here, S9 wires `AuthViewModel.swift`.
- **S1 (DB Migrations)** owns the `requires_verified` column drop migration that lets S3 cleanly drop the resolver branch (Q1b-AUTH below).
- **S6 (Admin)** owns admin-side perms-list UI; S3's `requires_verified` resolver-drop is a coordinated change but does not edit S6 surfaces.

The 8 sub-items below are the operative work. Q2-h is owner-side dashboard configuration only.

---

### S3-Q2-a — Build `/api/auth/send-magic-link` 🟩 37d02f4

**Source:** OWNER-ANSWERS Q2 (item 1) + Q2b (item 4).

**Severity:** HIGH — single new endpoint that becomes the entire auth-submit surface.

**File (NEW):** `web/src/app/api/auth/send-magic-link/route.js`.

**Specification (locked):**
- Method: POST.
- Body: `{ email: string }`.
- Validation: malformed email → 400 with `{ error: "Please enter a valid email." }`. Missing field → 400 same shape.
- Server action: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
- Response: **always 200**, regardless of whether the email is new (signup) or existing (signin) or rate-limited or `signInWithOtp` returned an error. Body always:

  ```json
  {
    "ok": true,
    "message": "If that email is registered we sent you a sign-in link; otherwise we sent you a signup link. Check your inbox."
  }
  ```

- Rate limit: `RATE_LIMITS.AUTH_MAGIC_LINK_SEND_PER_EMAIL` (3/hour per email) + `RATE_LIMITS.AUTH_SIGNUP_SUBMIT_PER_IP` (5/hour per IP). On cap hit → same 200 generic body. Internal `rate_limit_events` row + `error_logs` row capture the cap event for ops visibility, never reaching the client.
- IP truncation: use `truncateIpV4` from `lib/apiErrors.js` (post-A72 fix) to log `/24` only.

**No oracle.** The response shape, status code, and latency are constant across (a) email exists + link sent, (b) email is new + signup link sent, (c) `signInWithOtp` returned a transient error, (d) rate-limited. The only 4xx case is malformed input — that distinction is fine to leak (input format isn't an enumerable signal).

**Why.** Replaces the legacy `/api/auth/login`, `/api/auth/login-precheck`, `/api/auth/login-failed`, `/api/auth/signup`, `/api/auth/signup-rollback`, `/api/auth/verify-password`, `/api/auth/resend-verification`, `/api/auth/check-email`, `/api/auth/resolve-username`, and `/api/auth/reset-password` surfaces with a single endpoint. Removes nine routes worth of attack surface.

**iOS contract (published for S9):**

```
POST /api/auth/send-magic-link
Content-Type: application/json
Body: { "email": "user@example.com" }

Always returns 200 with:
{ "ok": true, "message": "..." }

Or 400 only on malformed input:
{ "error": "Please enter a valid email." }
```

iOS `AuthViewModel.swift` calls this endpoint with the user's email, shows the success copy, and waits for the deep-link callback at `handleDeepLink` (existing — already calls `setSession()` after parsing magic-link tokens). Post-`setSession()`, iOS checks `users.username IS NULL` and routes to `PickUsernameView` (S9 builds) or Home accordingly.

**Dependencies.** Depends on S3-A129 (`lib/rateLimits.ts`). Coordinates with S9 — S9 reads this contract.

**Verification.**
1. POST `/api/auth/send-magic-link` with valid existing-user email → 200 generic body, magic-link email arrives.
2. POST with valid new-user email → 200 generic body, signup magic-link arrives.
3. POST 4 times within an hour from same email → 4th returns same 200 body, no email sent, `rate_limit_events` row exists.
4. POST with `{}` → 400 `{ error: "Please enter a valid email." }`.
5. POST with `{ email: "not-an-email" }` → 400 same.
6. Check timing: median latency of "email exists" path within 50ms of "email new" path (no timing-based oracle).

**Multi-agent shipping process.** Standard 4 pre + 2 post. **Security reviewer mandatory** — probes: timing oracle on Supabase round-trip differences, error-shape oracle on transient Supabase failures, log-leak oracle (does the error log differentiate enough to matter), CSRF risk on the POST (mitigated by SameSite cookies + the route doesn't read auth state from cookies, so CSRF is a non-issue, but reviewer confirms).

---

### S3-Q2-b — Replace `/login` UI with email-only form 🟩 a3159ac

**Source:** OWNER-ANSWERS Q2 (item 1).

**Severity:** HIGH — primary auth entry point.

**File:** `web/src/app/login/page.tsx`.

**Current state.** Multi-step password-based form: email field → `/api/auth/login-precheck` → reveals password field → submit to `/api/auth/login` → on failure, posts `/api/auth/login-failed` for lockout bookkeeping. ~700 lines of state machine handling lockout, attempt counter, "X attempts remaining" copy.

**Fix.** Rebuild as a single email-only form posting to `/api/auth/send-magic-link`. UI shape:
- Single email input (autofocus, type=email, autocomplete=email).
- Submit button labeled "Send sign-in link."
- Below: "We'll email you a one-time sign-in link. No password required."
- After submit: replace form with the success card "If that email is registered we sent you a sign-in link; otherwise we sent you a signup link. Check your inbox." + a 30-second "Resend" button (disabled until cooldown expires).
- OAuth section (Apple + Google buttons) hidden behind `FeatureFlag.oauthEnabled` (default false). Code preserved per memory `feedback_launch_hides`.

**Drop:** all password-related state, lockout state, attempt-counter state, password show/hide toggle, multi-step transitions. The component shrinks from ~700 lines to ~150.

**Why.** Single-step UX matches Linear / Vercel / Substack / Notion. Removes an entire class of UX edge cases (lockout-without-warning, "X attempts remaining" inconsistency from A108, 30s-resend-vs-1hr-TTL collision from A111).

**Dependencies.** Q2-a (the route the form posts to). Q2-d (OAuth feature-flag mechanism).

**Verification.**
1. `/login` renders single email field. No password field.
2. Submit with valid email → success card appears, no console errors.
3. `grep -rn "signInWithPassword\|login-precheck\|login-failed" web/src/app/login/` returns zero hits.
4. OAuth buttons hidden; `FeatureFlag.oauthEnabled = true` (manual flip in dev) → buttons reappear.

**Multi-agent shipping process.** Standard 4 pre + 2 post. Adversary probes: form-resubmit on rapid double-click (idempotency on the route handles), browser back-button after submit (idempotent, posting again is fine), keyboard nav order (a11y reviewer).

---

### S3-Q2-c — `/signup` becomes a real route 🟩 a3159ac

**Source:** OWNER-ANSWERS Q2c — locked. Resolves audit A46.

**Severity:** MEDIUM — conversion path UX + analytics.

**File:** `web/src/app/signup/page.tsx`. Currently a server-side redirect to `/login` (line 11 — `redirect('/login')`).

**Current state.** 11 CTAs across the codebase point at `/signup`, all hit the redirect:
`bookmarks/page.tsx:317`, `notifications/page.tsx:228`, `kids-app/page.tsx:182`, `help/page.tsx:313`, `how-it-works/page.tsx:144`, `NavWrapper.tsx:347`, `leaderboard/page.tsx:723`, `LockModal.tsx:61`, `verify-email/page.tsx:447`, plus two more from the audit.

**Fix.** Build `/signup` as a real page that mirrors the rebuilt `/login` shape (Q2-b) with signup-mode copy:
- Headline: "Create an account." (vs `/login`'s "Sign in.")
- Submit button: "Send signup link." (vs "Send sign-in link.")
- Below copy: "We'll email you a one-time link to finish creating your account. No password required."
- Form posts to the same `/api/auth/send-magic-link` route — one endpoint serves both signin and signup; Supabase resolves which is which.

The 11 CTAs keep working unchanged. Analytics distinguishes `/signup` from `/login` for conversion funnels.

**Why.** Cleaner URL, cleaner analytics, less cognitive overhead. Resolves A46 (label-vs-destination mismatch). The redirect-vs-real-route pick was owner-locked to "real route" in Q2c.

**Dependencies.** Q2-a, Q2-b.

**Verification.**
1. GET `/signup` returns 200 with the form (not a 307 redirect).
2. Submit on `/signup` → success card same as `/login`.
3. Network tab: `/signup` does NOT redirect to `/login`.
4. `grep -rn "redirect.*signup\|signup.*redirect" web/src/app/signup/` returns zero hits.

**Multi-agent shipping process.** Standard 4 pre + 2 post. Light variant since the page is a copy of Q2-b's output with small copy changes — implementer can fork the `/login` component into a shared `<MagicLinkForm mode="signin" | "signup" />` component to avoid duplication.

---

### S3-Q2-d — Hide OAuth buttons behind feature flag 🟩 a3159ac

**Source:** OWNER-ANSWERS Q2 (item 3 + 4) + memory `feedback_launch_hides`.

**Severity:** LOW — preservation of existing wiring.

**Files:**
- `web/src/app/login/page.tsx` (Apple + Google buttons).
- `web/src/app/signup/page.tsx` (same).
- `web/src/app/api/auth/callback/route.js` — KEEP intact. Magic-link uses the same callback for token exchange.

**Current state.** Apple + Google sign-in buttons render unconditionally on `/login`. Backing handlers exist in the OAuth flow.

**Fix.** Wrap the OAuth section in `if (FeatureFlag.oauthEnabled) { ... }` (default false). Preserve every line of existing wiring — the flag-flip path is one constant change to re-enable.

```tsx
// Snippet shape:
{FEATURE_FLAGS.OAUTH_ENABLED && (
  <div className="oauth-section">
    <AppleSignInButton />
    <GoogleSignInButton />
  </div>
)}
```

`FEATURE_FLAGS.OAUTH_ENABLED` lives in a flags lib (out of S3 scope to design — agree on a location with S6 / S7 if a flags module doesn't yet exist; otherwise hardcode `const OAUTH_ENABLED = false;` at the top of `/login` and `/signup` with a comment pointing at this section).

**Why.** Memory `feedback_launch_hides`: hide via gates/flags, keep state + queries + types alive so unhide is one-line flip. Memory `feedback_kill_switched_work_is_prelaunch_parked`: launch-hidden work isn't deleted, just kill-switched.

**Dependencies.** Q2-b (the rebuilt `/login`), Q2-c (the rebuilt `/signup`).

**Verification.**
1. With flag false (default): OAuth buttons not in DOM on `/login` or `/signup`.
2. With flag true: OAuth buttons appear, click flow works (existing behavior).
3. `grep -rn "AppleSignIn\|GoogleSignIn" web/src/app/login web/src/app/signup` shows the buttons still imported (code preserved).

**Multi-agent shipping process.** Light 4 pre + 1 post (no security reviewer needed — pure UI hide of preserved behavior).

---

### S3-Q2-e — Build post-signin pick-username flow 🟩 294adcc + 37d02f4

**Source:** OWNER-ANSWERS Q2 (item 5) + Q2b (items 3, 7). Resolves T22, T200, T252 from TODO2.

**Severity:** HIGH — every new signup hits this path.

**Files (NEW):**
- `web/src/app/welcome/pick-username/page.tsx` (route TBD — owner picked this path in Q2; if a `/welcome/pick-username` already exists or the route shape conflicts, coordinate with S7 which owns `/welcome/`).
- `web/src/app/api/auth/check-username/route.js` — modify (collapse to session-scoped boolean per Q2b).

**Current state.** `web/src/app/api/auth/check-username/route.js` returns `{ available: boolean, reserved: boolean }` — three-bit oracle (taken / reserved / available). No session-scoping. Anonymous calls allowed.

**Fix.**

1. **Pick-username page.** Single-screen UI:
   - Username input (debounced 250ms inline check via `/api/auth/check-username`).
   - Green check / red X next to the field on availability.
   - Server-side enforcement is the DB UNIQUE constraint at save — inline check is UX polish only.
   - Submit button calls a small server action (`/api/auth/save-username` or inline in the page's POST handler — implementer picks). The action upserts `users.username` for the authenticated user; on UNIQUE violation (race), returns 409 with `{ error: "That username was taken just now — pick another." }`.
   - On success: redirect to `/` (Home).

2. **`/api/auth/check-username` collapse.** Returns `{ available: boolean }`. Drops the `reserved` field. Reserved usernames (system handles, profanity, brand-protected) collapse into `available: false` from the API surface. Endpoint becomes session-scoped: anonymous calls return 401. Rate limit: `RATE_LIMITS.AUTH_USERNAME_CHECK_PER_SESSION` (30/min per session).

3. **Routing logic.** After magic-link callback at `/api/auth/callback`, the callback handler checks the just-signed-in user's `users.username`. If NULL → redirect to `/welcome/pick-username`. If present → redirect to `/` (or whatever `next` param landed). This logic also lives in middleware as a defensive fallback for direct navigation.

4. **iOS parity.** Same logic in `AuthViewModel.swift.handleDeepLink` post-`setSession()` (S9 owns the iOS half — S3 publishes the contract).

**Why.** Magic-link's signup path establishes a session before the user has picked a username. Pick-username is a separate post-signin step. The DB UNIQUE constraint is the real enforcement; the inline check is debounced UX polish.

This dissolves three TODO2 items by structural elimination:
- **T22** — pick-username step exists, lives post-signin.
- **T200** — username retry loop is now a 409 response with a clean retry; not a multi-step retry-with-rolling-back-the-auth-row.
- **T252** — race vs `auth.signUp` is gone (no `auth.signUp` call exists anymore); username race is now race-on-UPSERT, resolved by the UNIQUE constraint at the DB layer.

**Dependencies.** Q2-a, Q2-b, Q2-c. Coordinates with S7 if `/welcome/` route hierarchy conflicts.

**Verification.**
1. New signup via magic-link → click link → land on `/welcome/pick-username` (NOT `/`).
2. Type username → debounced check fires after 250ms idle → red X for taken / reserved / profanity, green check for available.
3. Submit available username → row updated, redirect to `/`.
4. Repeat with a username that becomes taken between the inline check and submit (simulate via two-window race) → 409 + "taken just now" copy.
5. Anonymous GET `/api/auth/check-username?u=foo` → 401.
6. Authed GET 31 times in a minute → 31st returns 429 (or generic 200 same shape — implementer picks; whatever Q2b's pattern allows; if 429 is leaked here, it's session-scoped so the leak is bounded).

**Multi-agent shipping process.** Standard 4 pre + 2 post. **Security reviewer mandatory** — probes: race window between inline check and save (handled by 409 retry), session-scope bypass (anonymous 401 + per-session cap), reserved-username enumeration via timing (collapse to single boolean response makes this hard, but reviewer confirms no per-reason latency difference).

---

### S3-Q2-f — Publish iOS auth contract for S9 🟩 37d02f4 (header in send-magic-link/route.js)

**Source:** OWNER-ANSWERS Q2 (item 2 + 7).

**Severity:** HIGH — coordination boundary.

**Files (S3 owns):** the API contract published in this section. S3 does NOT edit `VerityPost/VerityPost/AuthViewModel.swift` — that's S9's territory.

**Current state.** iOS uses `client.auth.signInWithPassword(...)` against the Supabase SDK directly. No call to `/api/auth/login` or `/api/auth/login-precheck`. The deep-link handler at `handleDeepLink` (`AuthViewModel.swift:389`) already calls `setSession()` after parsing magic-link tokens — exists for OAuth callback compatibility.

**Contract published for S9 (this is S3's deliverable):**

```
=== iOS Magic-Link Contract ===

(1) User taps "Send sign-in link" / "Send signup link":
    - iOS POSTs to /api/auth/send-magic-link with { email }
    - Always succeeds (200 + generic body); show success card "Check your inbox"
    - 30-second resend cooldown on iOS side (matches web)

(2) User clicks the magic link in their inbox:
    - Universal Link → app opens → handleDeepLink(url) fires
    - Existing setSession() call already wires this up — no change needed there

(3) Post-setSession routing:
    - Read users.username for auth.uid()
    - If NULL → push PickUsernameView (S9 builds new SwiftUI view)
    - If present → push HomeView

(4) Pick-username submission (iOS):
    - Debounced 250ms /api/auth/check-username?u=<name> (returns { available: boolean })
    - On submit: PATCH /api/auth/save-username with { username }
    - On 409 (UNIQUE race): show "Taken — try another"
    - On success: push HomeView

(5) Audit log:
    - /api/auth/send-magic-link writes a `magic_link_sent` audit row
    - The token redemption (Supabase server-side) writes `magic_link_redeemed`
    - iOS does not write its own audit rows — server-side coverage is the canonical record
    - No more password-attempt-count / login-failed / login-succeeded events on iOS

(6) OAuth buttons:
    - HIDE both Apple and Google sign-in behind a build flag (default disabled)
    - Code preserved; one-line flip to re-enable
    - Backing handlers in AuthViewModel stay intact

(7) Logout:
    - No change — existing logout flow already calls supabase.auth.signOut()
```

**Fix (S3 side).** Add this contract to `web/src/app/api/auth/send-magic-link/route.js` as a header comment block so future agents reading the route learn what calls it. Also add a note at the top of `Session_09_iOS_Adult.md` referencing this section. (S9 reading this file IS the contract delivery — no separate doc artifact required.)

**Why.** Cross-session coordination without breaking hermeticity. S9 reads this section, builds the iOS half. S3 doesn't reach into iOS files.

**Dependencies.** Q2-a, Q2-e.

**Verification.**
1. Header comment in `/api/auth/send-magic-link/route.js` references this contract.
2. S9 ack'd: when S9 ships its end, the items in S9's Q2 slice match the 7 numbered points above.

**Multi-agent shipping process.** Light — this is contract publication, not code. Pre-impl: planner + adversary review the contract for ambiguity. Post-impl: code reviewer confirms the header comment block landed.

---

### S3-Q2-g — Soft-delete `/forgot-password` 🟩 6c04ffa

**Source:** OWNER-ANSWERS Q2 (item — implicit; magic-link makes password-reset vestigial). Resolves A48, A111.

**Severity:** LOW — vestigial surface.

**File:** `web/src/app/forgot-password/page.tsx`.

**Current state.** Full page with email input → POST `/api/auth/send-reset` → success card with "The link expires in 1 hour" copy + 30-second resend cooldown. Both the 1-hour TTL claim (A48 — unverified) and the resend-cooldown-vs-link-expiry copy collision (A111) are real bugs in the current page.

**Fix.** Replace the page with a redirect-shaped soft-delete:

```tsx
// web/src/app/forgot-password/page.tsx
import { redirect } from 'next/navigation';

export default function ForgotPasswordPage() {
  // Magic-link replaces password reset. There's no password to reset under
  // the new auth model. Redirect to /login where the magic-link flow is
  // the entry point — the magic-link IS the recovery path.
  redirect('/login?recovered=1');
}
```

The `?recovered=1` query param lets `/login` show a small "We use one-time sign-in links — request one here" notice above the form for users who landed via a stale forgot-password bookmark.

**Drop:**
- `web/src/app/api/auth/reset-password/route.js` — entire file deleted.
- Any link to `/forgot-password` in the codebase (verify with grep — likely just the `/login` page's prior "Forgot password?" link, which is removed by Q2-b's rebuild).

A48 (1-hour TTL claim) and A111 (cooldown-vs-expiry copy collision) are both moot — the page is gone.

**Why.** Magic-link IS the recovery path. Keeping `/forgot-password` alive creates two parallel recovery flows (memory `feedback_genuine_fixes_not_patches`: no parallel paths). The redirect preserves the URL for stale bookmarks without keeping a second flow alive.

**Dependencies.** Q2-b (the `/login` rebuild handles the `?recovered=1` notice).

**Verification.**
1. GET `/forgot-password` → 307 redirect to `/login?recovered=1`.
2. `/login?recovered=1` shows the recovery notice.
3. `/api/auth/reset-password` route file deleted; route returns 404.
4. `grep -rn "/forgot-password" web/src/` shows only the redirect file itself + maybe a stale reference (clean those up too).

**Multi-agent shipping process.** Light. Adversary probes: any deep link via email that points at `/forgot-password/<token>` — confirm with email-template owner pass that no template references `/forgot-password/` URLs. (Q2-h is the email-template dashboard sweep on owner side.)

---

### S3-Q2-h — Update Supabase email-template copy 🟧 OWNER-SIDE

**Source:** OWNER-ANSWERS Q2 (item 7).

**Severity:** MEDIUM — user-facing email copy.

**Action.** Owner-side dashboard work, NOT code. Owner updates the Supabase Auth email templates (Magic Link, Confirm Signup, Password Recovery) in the Supabase Dashboard to:
- Use Verity-Post-branded copy.
- Match the generic-no-oracle UX (single template that works whether the user is signing up for the first time or signing in).
- Drop any password-reset template since that flow is gone.

**Fix (S3 side).** Add this as a flagged owner-side action item in the deferred-cleanup list (§ 6 below). No code edits.

**Why.** The Supabase-managed email templates ship the OTP link content; mismatched copy ("Confirm your password reset") on a magic-link email confuses users.

**Dependencies.** Owner-only.

**Verification.** Owner confirms the templates are updated post-Q2 ship.

---

## 3. Privacy / correctness sweep (independent of Q2)

### S3-A10 — `account/delete` revoke `public.sessions` rows 🟩 25ebecb (immediate-path; cron-path deferred to S1's anonymize_user RPC update)

**Source:** TODO_READ_ONLY_HISTORICAL.md A10 + PotentialCleanup B8 (INHERITED — verified during investigator pass per memory `feedback_verify_audit_findings_before_acting`).

**Severity:** HIGH — privacy + analytics-integrity gap.

**File:** `web/src/app/api/account/delete/route.js:135-160`.

**Current state.** Calls `auth.admin.deleteUser(userId)` but doesn't revoke rows in `public.sessions`. Other devices' bearer tokens stay valid until natural expiry; analytics queries see "active session" rows for deleted users.

**Fix.** Before `auth.admin.deleteUser(userId)`, run:

```sql
UPDATE sessions
   SET is_active=false, revoked_at=now(), revoke_reason='user_deleted'
 WHERE user_id=$1;
```

**Coordination with S1.** Verify whether `anonymize_user` RPC (S1-T2.2 territory) already does this. If yes, consolidate into the RPC and remove the route-handler revoke (avoid double-revoke). If no, S1 should add the revoke into the same migration so redaction + revocation ship as one atomic step.

If S1 has already shipped `anonymize_user` without the revoke, S3 can either (a) add the revoke to the route handler as a pre-step (defensive), or (b) defer this item until S1 adds the revoke into the RPC. **Recommended:** (b) — keep the redaction logic atomic in one place. Flag the dependency, defer.

**Why.** A phone forgotten at the airport keeps a working session even after the user deleted their account from a different device. Deleted-user sessions inflate active counts in analytics.

**Dependencies.** S1 (whether `anonymize_user` already revokes sessions).

**Verification.**
1. Delete a test account → query `sessions` where `user_id = <deleted>` → all rows have `is_active=false` AND `revoked_at IS NOT NULL` AND `revoke_reason='user_deleted'`.
2. The deleted user's old bearer token (captured before deletion) → 401 on any authed route.
3. Single-step atomicity: a partial failure between revoke and `deleteUser` leaves the system in a recoverable state (sessions revoked but auth row exists is OK; auth row deleted with sessions still active is the bug).

**Multi-agent shipping process.** Standard 4 pre + 2 post. **Security reviewer mandatory** — probes: race between revoke and `deleteUser`, partial-failure recovery, idempotency on retry, cross-platform session revocation (does Supabase's auth.admin.deleteUser cascade-revoke its own GoTrue refresh tokens? — answer determines whether the SQL revoke is the only revoke needed or just one of two).

---

### S3-A72 — `truncateIpV4` returns full IP for malformed v6 🟩 34c9723

**Source:** TODO_READ_ONLY_HISTORICAL.md A72.

**Severity:** MEDIUM — privacy gap on a logging surface.

**File:** `web/src/lib/apiErrors.js:77-90`.

**Current state.** The function correctly truncates v4 to `/24` and IPv4-mapped-v6 (`::ffff:1.2.3.4`) to the v4 path. For non-v4-non-v6 shapes (malformed forwarded headers, garbage values), the fallback at line 86-87 returns `${ip.slice(0, colonIdx)}:0` — preserving most of the original IP if it happens to contain a colon.

```js
// Current line 84-87:
// Non-v4 (likely IPv6): preserve only the first /48 equivalent.
// Conservative fallback — just drop the last ':' segment.
const colonIdx = ip.lastIndexOf(':');
return colonIdx > 0 ? `${ip.slice(0, colonIdx)}:0` : null;
```

**Fix.** On any non-v4-non-v6 shape, return `null`. Better to lose a forensic detail than log full IPs:

```js
// New shape:
const parts = candidate.split('.');
if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) {
  // Non-v4 / malformed input: return null. Privacy default — better to
  // lose forensic detail than log a full IP that bypasses /24 truncation.
  // Real IPv6 addresses should arrive here in normalized form; if they
  // don't, the caller's input pipeline has a bigger problem than this
  // helper can solve.
  return null;
}
return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
```

**Why.** Audit/error logs are supposed to truncate IPs. A malformed header (e.g., a hostile X-Forwarded-For of `::ffff:` or `garbage:value`) currently bypasses the truncation entirely and ships into `error_logs` with most of its original content. Fail-closed.

**Dependencies.** None.

**Verification.**
1. `truncateIpV4('192.168.1.1')` → `'192.168.1.0'`.
2. `truncateIpV4('::ffff:192.168.1.1')` → `'192.168.1.0'`.
3. `truncateIpV4('::1')` → `null` (was: `':0'` previously — confirm by reading the current return).
4. `truncateIpV4('garbage:value:here')` → `null` (was: `'garbage:value:0'` previously).
5. `truncateIpV4('completely-malformed')` → `null` (no colon path).
6. `truncateIpV4('')` → `null`.
7. `truncateIpV4(null)` → `null`.

**Multi-agent shipping process.** Light 4 pre + 1 post. Adversary probes: is there a real-IPv6 path that arrives at this function (e.g., a legitimate `2001:db8::1` v6 address)? Yes — the previous fallback supported it crudely. The fix loses real-IPv6 truncation for the gain of malformed-input safety. The audit's recommendation is explicit: lose the detail. If a future product needs proper /48 IPv6 truncation, that's a separate addition.

---

### S3-A127 — Site URL fallback hardcodes 🟩 34c9723 (kids-route slice handed to S10)

**Source:** TODO_READ_ONLY_HISTORICAL.md A127.

**Severity:** MEDIUM — preview-deploy correctness.

**Files (in scope):**
- `web/src/lib/email.js:78` — `process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com'` for the unsubscribe URL fallback.
- (`web/src/app/api/kids/[id]/advance-band/route.ts:161` is in **S10 scope**, NOT S3. Hand off to S10.)

**Current state.** Line 78 of `email.js`:
```js
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
```

When the env var is missing on a preview deploy, the unsubscribe URL points at production. Clicking unsubscribe from a preview-env email lands on the wrong env.

The codebase already has a centralized `getSiteUrl()` / `getSiteUrlOrNull()` helper at `web/src/lib/siteUrl.js`. The `email.js` site-url path bypasses it.

**Fix.** Replace with `getSiteUrlOrNull()` (the email-send path can degrade gracefully — if no site URL is resolvable, drop the unsubscribe header rather than ship a wrong URL):

```js
import { getSiteUrlOrNull } from './siteUrl';

// Inside sendEmail:
const siteUrl = getSiteUrlOrNull();
const fallbackUnsub = siteUrl ? `${siteUrl}/profile/settings#emails` : null;
const unsubHeaders = buildUnsubscribeHeaders(unsubscribeUrl || fallbackUnsub);
if (unsubHeaders) body.headers = unsubHeaders;
```

If `getSiteUrlOrNull()` returns `null` AND no per-recipient `unsubscribeUrl` was passed, no `List-Unsubscribe` header is sent. Gmail compliance prefers a present header over a wrong one — degrading to absent on missing env is the right choice.

**Why.** Preview deploys without the env var ship URLs pointing at prod. Email unsubscribe URLs from preview break the unsubscribe state machine.

**Hand off to S10:** `web/src/app/api/kids/[id]/advance-band/route.ts:161` — same hardcoded fallback. S10 owns kids routes; S3 flags it in their session file (already noted in `Session_10_iOS_Kids.md` if S10's audit picked it up; if not, a one-line note here suffices: **S10 hand-off** — fix this one too).

**Dependencies.** None — `getSiteUrlOrNull` already exists.

**Verification.**
1. With `NEXT_PUBLIC_SITE_URL` unset in dev: `getSiteUrlOrNull()` returns `'http://localhost:3333'` (dev fallback).
2. With env unset in prod-like (`VERCEL_ENV=production`): returns `null`. Email send drops the unsub header.
3. With env set: returns the trimmed env value, unsub header points there.
4. `grep -n "veritypost\.com" web/src/lib/email.js` returns zero hits.

**Multi-agent shipping process.** Light 4 pre + 1 post.

---

## 4. Q2-adjacent items (most are moot once Q2 ships)

### S3-Q2d — Graduate-kid claim rate limit + status-code collapse 🟩 26c889c (option A — password-removal deferred to follow-up)

**Source:** OWNER-ANSWERS Q2d (locked) + TODO_READ_ONLY_HISTORICAL.md A24.

**Severity:** CRITICAL — highest-stakes auth surface in the product. A hijacked claim takes over a 13-year-old's account.

**File:** `web/src/app/api/auth/graduate-kid/claim/route.ts`.

**Current state.** Public route. Takes `{token, email, password}` (the password input becomes irrelevant under Q2 — see Q2-coordination note below). Calls `auth.admin.createUser`. **No per-IP throttle, no per-token throttle.** Returns:
- 410 for expired tokens.
- 400 for token mismatches.
- Other 4xx variants for kid_profile_id resolution failures.

The 410-vs-400 distinction is a token-existence oracle: an attacker probing random token strings learns when they hit a real-but-expired token.

**Fix.** Three changes, all in the same route handler.

1. **Rate-limit additions** at the top of the handler:
   ```ts
   import { getRateLimit } from '@/lib/rateLimits';
   import { checkRateLimit } from '@/lib/rateLimit';

   const ipPolicy = getRateLimit('AUTH_GRADUATE_CLAIM_IP');
   const ipCheck = await checkRateLimit({ key: `gk_claim_ip:${truncatedIp}`, ...ipPolicy });
   if (!ipCheck.ok) return genericClaimError();

   const tokenPolicy = getRateLimit('AUTH_GRADUATE_CLAIM_TOKEN');
   const tokenCheck = await checkRateLimit({ key: `gk_claim_tok:${tokenHash}`, ...tokenPolicy });
   if (!tokenCheck.ok) return genericClaimError();
   ```

   - Per-IP: `RATE_LIMITS.AUTH_GRADUATE_CLAIM_IP` (10/hour).
   - Per-token: `RATE_LIMITS.AUTH_GRADUATE_CLAIM_TOKEN` (5/min). Keyed on the SHA-256 hash of the submitted `token` value (don't key on the raw token — that puts the token in the rate-limit table).

2. **Status-code collapse.** Both expired (was 410) and invalid (was 400) tokens return **400** with identical body:
   ```json
   { "error": "This signup link isn't valid. Please ask your parent for a new one." }
   ```

   All kid-claim-side failures collapse into the same generic copy: token expired, token invalid, token already used, kid_profile_id resolution failure, parent-not-found. The `genericClaimError()` helper returns this exact 400.

3. **Internal audit log preservation.** Each failure path writes an `audit_log` row before returning the generic body:
   ```sql
   INSERT INTO audit_log (action, actor_user_id, target_kid_profile_id, metadata, ip_truncated, created_at)
   VALUES ('graduate_claim_failed', NULL, $kid_id, $metadata, $ip_24, now())
   ```
   Where `$metadata` includes `{ reason: 'token_expired' | 'token_invalid' | 'token_already_used' | 'kid_resolution_failed', token_hash: <sha256> }`. Real reason captured for ops, never reaches the response.

**Q2 coordination.** Under Q2 (magic-link only), the `password` input on this route becomes vestigial — graduation now mints a magic-link-style account, not a password account. The route signature changes: `{token, email}` only. Post-graduation the kid receives a magic-link to confirm and set up their adult-app session. This is a deeper rework — coordinate with the planner pass to decide whether Q2d ships:
- (A) **Rate-limit + status-code collapse first**, password-removal second (in a follow-up commit). Lower risk, two PRs.
- (B) **Full rework** — graduation flow shifts to magic-link in one commit. Higher risk, one PR.

**Recommended:** (A). Ship the rate-limit + oracle-collapse independently of Q2's signup-flow rewrite. The two changes are orthogonal — graduation is a kid → adult transition, distinct from new-adult signup. Plan (A) keeps the two fixable surfaces separate.

**Why.** Graduation is the highest-stakes auth surface in the product. A hijacked claim takes over a 13-year-old's quiz history, badges, score, follows, and graduates them into an adult account under attacker control. Best-practice rate-limit + oracle-collapse is non-negotiable.

The token-existence oracle (410 vs 400) means an attacker probing random token strings learns when they hit a real-but-expired token. With 256-bit tokens this is theoretically uneconomic, but the principle of "no oracle on auth surfaces" applies regardless of token entropy.

**Dependencies.** S3-A129 (`lib/rateLimits.ts`).

**Verification.**
1. POST with valid token → 200, kid graduates.
2. POST with expired token → 400 `{error: "This signup link isn't valid. Please ask your parent for a new one."}` + `audit_log` row with `reason='token_expired'`.
3. POST with random invalid token → 400 same body + `audit_log` row with `reason='token_invalid'`.
4. POST with same valid token replayed past redemption → 400 same body + `reason='token_already_used'`.
5. POST 11 times in an hour from one IP → 11th returns same 400 body, `rate_limit_events` row.
6. POST 6 times in a minute against one token (expired or invalid) → 6th returns same 400 body, `rate_limit_events` row keyed on `gk_claim_tok:<hash>`.
7. End-to-end smoke: parent generates graduation link → kid clicks → kid completes claim → `auth.users` row created, `kid_profiles.graduated_to_user_id` populated, `kid_profiles.status='graduated'`. Same flow with deliberately-expired token (set `expires_at` in past via DB) → claim fails with new generic body, audit log shows `token_expired`.

**Multi-agent shipping process.** **Mandatory full 4 pre + 2 post.** Security/correctness reviewer probes: timing-side oracle on the rate-limit-hit path vs valid-but-expired path (responses must be timing-equivalent), token-hash collision risk (SHA-256 — non-issue), audit-log row visibility (RLS on `audit_log` — confirm only ops can read), kid_profile race (can two graduate-claims fire concurrently for the same kid_profile_id — UNIQUE constraint or RPC `FOR UPDATE` is the right enforcement; verify which exists in the current schema).

---

### S3-Q2b — Drop enumeration oracles 🟩 a3159ac + 37d02f4 (check-email + resolve-username deleted; check-username collapsed to boolean)

**Source:** OWNER-ANSWERS Q2b (locked). Resolves audit A25.

**Severity:** HIGH — phishing-grade enumeration surface.

**Files:**
- DELETE `web/src/app/api/auth/check-email/route.js`.
- DELETE `web/src/app/api/auth/resolve-username/route.js`.
- COLLAPSE `web/src/app/api/auth/check-username/route.js` to session-scoped `{ available: boolean }` (already covered in Q2-e).

**Current state.** Three routes individually rate-limited but combine into a complete signup-state oracle:
- `/api/auth/check-email` → `{available: !registered}` — direct existence signal.
- `/api/auth/check-username` → `{available, reserved}` — three-bit oracle.
- `/api/auth/resolve-username` → `{email}` for known usernames, `{email: null}` for unknown.

Combined budget: ~14.4k probes/day at per-IP cap.

**Fix.**
1. **DELETE `/api/auth/check-email/route.js`** — file removed. Signup form (Q2-c) doesn't call it; magic-link UX is identical for new and existing emails.
2. **DELETE `/api/auth/resolve-username/route.js`** — file removed. Login is email-only under magic-link; mapping @handle → email has no legitimate user purpose.
3. **COLLAPSE `/api/auth/check-username/route.js`** — already specified in Q2-e. Returns `{available: boolean}` only, session-scoped, anonymous calls 401.
4. **NEW `/api/auth/send-magic-link/route.js`** — already specified in Q2-a. Uniform 200 response.

**Drop callers:**
- Any UI component calling `/api/auth/check-email` — drops with the form rebuild in Q2-b/Q2-c.
- Any UI component calling `/api/auth/resolve-username` — drops with the `/login` rebuild.

**Why.** Closes a known phishing-grade enumeration surface. Aligns with the magic-link UX pattern adopted by Linear, Vercel, Substack, Notion. Removes a maintenance class.

**Dependencies.** Q2-a, Q2-b, Q2-c, Q2-e.

**Verification.**
1. `grep -rn "check-email\|resolve-username" web/src/` returns zero hits.
2. GET `/api/auth/check-email` → 404.
3. GET `/api/auth/resolve-username` → 404.
4. GET `/api/auth/check-username?u=foo` (anonymous) → 401.
5. Authed GET `/api/auth/check-username?u=foo` → `{available: boolean}` only (no `reserved` field).

**Multi-agent shipping process.** Standard 4 pre + 2 post. Adversary probes: any caller missed (search the iOS app source under `VerityPost/` and `VerityPostKids/` for `check-email` / `resolve-username` references — flag for S9 / S10 if found).

---

### S3-Q2a — Supabase Confirm-email setting (LOCKED — informational) 🟧 OWNER-LOCKED

**Source:** OWNER-ANSWERS Q2a — locked.

**Decision (locked):** Confirm-email setting in the Supabase Dashboard stays **DISABLED**.

**Implication for code:** Sessions are minted **immediately** on `signInWithOtp({ email })` submission, before the user clicks the magic link. The clicked link confirms the email and stamps `users.email_verified=true` but the session itself is live from the moment of submission.

**Action required by S3:** None — the route handler (Q2-a) treats the immediate-session-mint as expected behavior. The pick-username post-signin step (Q2-e) runs the moment the session lands, not after the click. The `email_verified` flag is purely a soft signal for the banner's visibility (Q1b) — toggle banner off when `email_verified=true`.

**Anti-abuse counter-pressures:** rate-limit-per-IP on signup (Q2-a, A129), score-tier-gating on certain perms (S6 territory), comment surface's quiz-gate (S7 territory), captcha-on-signup if pressure surfaces post-launch (deferred, not in any session today).

**Status:** 🟧 LOCKED. No code work. Documented here for audit trail.

---

### S3-A48 — `/forgot-password` "1 hour" TTL claim 🟨 MOOT-UNDER-Q2

**Source:** TODO_READ_ONLY_HISTORICAL.md A48.

**Status:** **MOOT** under Q2-g (forgot-password page is soft-deleted to redirect). If Q2-g ships first (it should — see § 0.8 order), this item drops.

**If Q2-g is somehow blocked:** verify the actual Supabase Auth dashboard token TTL setting AND `/api/auth/send-reset` enforcement window. Either (a) match copy at `web/src/app/forgot-password/page.tsx:294-295` to the actual TTL, or (b) remove the specific number ("Check your email for the reset link.").

**Action.** None when Q2-g ships first. Mark ✅ MOOT after Q2-g lands.

---

### S3-A111 — Resend cooldown vs link expiry copy collision 🟨 MOOT-UNDER-Q2

**Source:** TODO_READ_ONLY_HISTORICAL.md A111.

**Status:** **MOOT** under Q2-g. Same reason as A48 — page is soft-deleted.

**Action.** None when Q2-g ships first. Mark ✅ MOOT after Q2-g lands.

---

### S3-A112 — `/verify-email` rate-limit copy "about an hour" 🟩 4f7d5c1

**Source:** TODO_READ_ONLY_HISTORICAL.md A112.

**Severity:** LOW — copy precision.

**File:** `web/src/app/verify-email/page.tsx:334`.

**Current state.** Static fallback "about an hour" rendered on the page. Server returns precise reset time (line 120 sets 60-second cooldown; line 129 shows precise countdown elsewhere). The static fallback shipped where the precise value should be available.

**Q2 coordination.** Under Q2 (magic-link only), `/verify-email` may also become vestigial — clicking the magic-link IS the verification. Confirm before editing:

- If a user has `email_verified=false` post-Q2, do we still surface a `/verify-email` page? Per Q1b (banner-only verification), the banner copy says "Confirm your email" with a "Resend" button; tapping the button re-fires `/api/auth/send-magic-link` for the same email. There may be no separate `/verify-email` page at all under the new model.

**Recommended action.** During Q2-b implementation, evaluate whether `/verify-email` is still a real page. If it survives Q2 as a real page, fix A112 by rendering the actual server-returned reset time, not the static fallback. If it's vestigial (most likely), soft-delete it with a redirect to `/` or `/login` similar to Q2-g.

**Verification.** Either (a) the page renders precise reset time when the server supplies one, OR (b) the page is gone and `grep -rn "/verify-email" web/src/` returns hits only from old emails / soft-redirect. Mark either ✅ FIXED or ✅ DELETED.

**Dependencies.** Q2-b.

**Multi-agent shipping process.** Light, bundles with the Q2-b decision review.

---

### S3-A108 — `/login` error attempt counter 🟨 MOOT-UNDER-Q2

**Source:** TODO_READ_ONLY_HISTORICAL.md A108.

**Status:** **MOOT** under Q2 (magic-link has no password attempts to count). The lockout state machine that A108 was about disappears under Q2-b's rebuild.

**Action.** None when Q2-b ships first. Mark ✅ MOOT after Q2-b lands.

---

### S3-A99 — `/signup/expert` step-1 race for authed users 🟩 2e10ecc

**Source:** TODO_READ_ONLY_HISTORICAL.md A99.

**Severity:** MEDIUM — race-condition UX bug on a conversion path.

**File:** `web/src/app/signup/expert/page.tsx`.

**Current state.** `useEffect` sets `authChecked=true` in `finally`. Render guard at line 392 checks `authChecked && !isAuthed && step === 1`. An authed user's `setStep(2)` may not fire before re-renders execute mid-async flow → authed user briefly sees step 1 (the unauthed signup form) before the page corrects itself.

**Fix.** Render a skeleton/spinner until `authChecked === true`. Don't gate on `!isAuthed && step === 1` — gate on `authChecked` first, then branch by `isAuthed`:

```tsx
if (!authChecked) {
  return <ExpertSignupSkeleton />;
}
if (!isAuthed) {
  // Step 1: unauthed signup form
  return <ExpertSignupStep1 />;
}
// Authed: skip directly to step 2 (apply form)
return <ExpertSignupStep2 />;
```

**Q2 coordination.** Under Q2, `/signup/expert` step 1 (unauthed signup) folds into the same email-only magic-link form. Step 2 (apply form) stays. The race-fix above is orthogonal to Q2's auth-mechanism change — fix the gating logic regardless of Q2 timing.

**Why.** Authed user briefly sees the wrong step. The flow is supposed to be 2-step for unauthed (signup + apply) and 1-step for authed (apply only).

**Dependencies.** Bundles with Q2-b cleanup but ships independently.

**Verification.**
1. Navigate to `/signup/expert` while authed → no flash of step 1 ever; skeleton briefly, then step 2.
2. Navigate while unauthed → skeleton briefly, then step 1.
3. Slow-network simulation (Chrome DevTools throttle) — same behavior, no step-1 flash for authed.

**Multi-agent shipping process.** Standard 4 pre + 2 post.

---

### S3-Q1b-AUTH — Drop `requires_verified` from auth flow 🟨 DEPENDS-ON-S1

**Source:** OWNER-ANSWERS Q1b — locked. Banner-only verification, no perm gate.

**Severity:** MEDIUM — code-path simplification + dissolves T320, T321 from TODO2.

**Files (in scope):**
- `web/src/lib/auth.js` — drop `requires_verified` reads in the perm resolver (none currently — `requirePermission` in `auth.js` calls `compute_effective_perms` RPC which is S1 territory; the function-level `requireVerifiedEmail` helper at lines 147-158 is separate from the perm resolver).
- `web/src/app/api/auth/email-change/route.js:146` — drop the `requires_verified` check if any (verify during investigator pass).

**Current state.** `requireVerifiedEmail` at `lib/auth.js:147-158` throws 403 when `user.email_verified` is false. Various API routes (S3-owned ones plus many in S5 / S6 / etc.) call `requireVerifiedEmail` directly. The perm-resolver path (`compute_effective_perms` RPC) reads a `requires_verified` column on the `permissions` table.

**Fix (S3 slice).**
1. **Remove all callers of `requireVerifiedEmail` from S3-owned files.** Callers in other sessions' files are flagged for those sessions. After all sessions finish, the helper function itself can be deleted.
2. **In `lib/auth.js`:** keep `requireVerifiedEmail` exported for now (other sessions still call it); flag for deletion in a follow-up commit once S5/S6/etc. drop their callers. Memory `feedback_genuine_fixes_not_patches`: kill the thing being replaced — but the kill happens after all callers are off, which is a cross-session effort.
3. **`/api/auth/email-change/route.js:146`** — investigator pass quotes the actual code. If a `requires_verified` check exists, drop it. If not, mark ✅ STALE.

**Coordination with S1.** This item depends on S1 shipping a migration that either:
- Sets every existing `requires_verified=true` row in `permissions` to `false` (RPC behavior unchanged but every perm resolves identically for verified and unverified users), AND
- Drops the `requires_verified` column from `permissions` in a follow-up migration once all callers are off it.

**Without S1's migration**, code-side drop is incomplete — the `compute_effective_perms` RPC still reads the column. If S1 hasn't migrated, this item waits.

**Q1b downstream effects (resolves automatically per OWNER-ANSWERS):**
- T320 (owner-link Pro recipients gutted) — dissolves. With no `requires_verified` gate, owner-link users can comment / follow / vote / use billing the moment they land in welcome.
- T321 (similar gate on billing surface) — dissolves.
- The `isBetaOwnerLinkSignup` bypass at `web/src/app/welcome/page.tsx:106` becomes vestigial — but `welcome/` is **S7-owned**. Hand off to S7: drop the boolean + cohort-and-plan-id check; welcome flow becomes uniform.

**Dependencies.** **S1** — `requires_verified` column drop migration.

**Verification.**
1. After S1 migration: `grep -rn "requires_verified" web/src/lib web/src/app/api/auth web/src/app/api/account` returns zero hits in S3-owned files.
2. `grep -rn "requireVerifiedEmail" web/src/app/api/auth web/src/app/api/account` returns zero hits in S3-owned files (callers removed).
3. Email-change flow still works end-to-end (user changes email, receives confirmation magic-link, new email lands).
4. Banner-only verification: a user with `email_verified=false` can comment / vote / follow without a 403; a banner appears on the authed shell with "Confirm your email" copy (banner work is S7 territory; S3 just doesn't block on the perm gate).

**Multi-agent shipping process.** Standard 4 pre + 2 post. Coordinate ship timing with S1 — wait for the migration to land in production before merging the code-side drop.

---

## 5. Q3b — Middleware kid-blind fix + `kindAllowed` param 🟨 BLOCKED on S1 (no [S1-Q3b] tags on main as of 2026-04-27)

**Source:** OWNER-ANSWERS Q3b — RED audit verdict. Co-ships with S1 (RPC kid-rejects + RLS hardening) + S10 (kids/pair issuer flip).

**Severity:** CRITICAL — kid JWT can land on EXPECTED-USER routes today.

**Status:** 🟨 — depends on S1 + S10 readiness. Build the diff, hold the merge until all three sessions are ready.

**The audit verdict (from RED audit):**

The middleware does NOT inspect `is_kid_delegated`. `getUser()` in `lib/auth.js` joins `public.users` and falls through to row-miss-as-defense (when a kid JWT references a kid_profile_id, the `users` join returns no row, so `requireAuth` returns null → 401, but only on routes that use `requireAuth`). Routes that bypass `requireAuth` (e.g., direct PostgREST reads, or the inline Supabase client patterns) can leak.

Worse: middleware itself does not gate on `is_kid_delegated` for any path. A kid JWT gets normal middleware treatment except for `/kids/*` (which redirects to `/profile/kids` for adults or `/kids-app` for anon). A kid JWT navigating to `/messages` or `/profile/billing` lands on the route → if the route handler is `requireAuth`-gated AND the kid's `users` join returns no row, the route 401s. But a route that does its own authed-Supabase-query pattern without the `users` join could leak.

**Fix (S3 slice — three changes):**

### 5.1 `lib/auth.js` — add `kindAllowed` parameter

Add a `kindAllowed: 'user' | 'kid' | 'either'` parameter to `requireAuth` and `requirePermission`. **Default `'user'`** — every existing caller is implicitly `'user'`-only after the change. Callers that need kid-token access (a small set, mostly under `/api/kids/*` which is S10 territory) explicitly pass `'kid'` or `'either'`.

```js
// New signature:
export async function requireAuth(client, { kindAllowed = 'user' } = {}) {
  const user = await getUser(client);
  if (!user) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    throw err;
  }

  // T-Q3b — kid-vs-user gate. Default 'user' means a kid JWT 401s here,
  // matching every legacy caller's expectation. 'kid' means kid-only,
  // 'either' means both. Kid identity is signaled by the JWT's
  // is_kid_delegated claim and by the kid_profile_id top-level claim;
  // both must agree for a kid path. Any disagreement = 401.
  if (kindAllowed !== 'either') {
    const isKid = user.kind === 'kid' || !!user.kid_profile_id;
    if (kindAllowed === 'user' && isKid) {
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.detail = 'kid token rejected on user-only route';
      throw err;
    }
    if (kindAllowed === 'kid' && !isKid) {
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.detail = 'user token rejected on kid-only route';
      throw err;
    }
  }
  return user;
}

export async function requirePermission(permissionKey, client, { kindAllowed = 'user' } = {}) {
  const supabase = await resolveAuthedClient(client);
  const user = await requireAuth(supabase, { kindAllowed });
  // ... existing perm-resolver logic unchanged ...
}
```

**Surface `user.kind`, `user.kid_profile_id`, `user.parent_user_id`** from `getUser()`. The current `getUser()` returns `{ ...profile, email: authUser.email, roles }`. Augment with claims read from the JWT so kid-vs-user can be determined without an extra DB read:

```js
// Inside getUser, after loading profile:
const claims = (await supabase.auth.getSession()).data.session?.user?.app_metadata || {};
const jwtPayload = (await supabase.auth.getSession()).data.session?.user || {};
const isKidDelegated = jwtPayload.is_kid_delegated === true || claims.is_kid_delegated === true;
const kidProfileId = jwtPayload.kid_profile_id || claims.kid_profile_id || null;
const parentUserId = jwtPayload.parent_user_id || claims.parent_user_id || null;

return {
  ...profile,
  email: authUser.email,
  roles,
  kind: isKidDelegated ? 'kid' : 'user',
  kid_profile_id: kidProfileId,
  parent_user_id: parentUserId,
};
```

(Implementer: pull the right fields out of the actual JWT shape used by the kids/pair issuer — coordinate with S10's claim shape. The exact accessor pattern depends on whether the claims live at the top level or under `app_metadata`. The investigator pass quotes the kids/pair claim shape.)

### 5.2 `middleware.js` — explicit kid-token reject on user routes

Add a kid-token reject at the top of the middleware function (after request-id mint, before the per-path branching):

```js
// T-Q3b — middleware kid-blind fix. A kid JWT carrying is_kid_delegated=true
// must NOT land on adult-app routes. Allowlist: /kids/* (existing redirect
// handles it), /_next/*, /api/kids/*, public assets.
const KID_ALLOWED_PREFIXES = [
  '/kids',
  '/_next/',
  '/api/kids/',
];
const KID_ALLOWED_EXACT = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];

const isKidAllowed =
  KID_ALLOWED_EXACT.includes(pathname) ||
  KID_ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p));

// Only fetch the user / inspect claims when needed AND on paths that aren't
// kid-allowed. needsUser path (around line 389-394) already loads `user`
// when isProtected/kids/beta-gate. Augment that to inspect the JWT claim.
if (user && !isKidAllowed) {
  const isKid =
    user.app_metadata?.is_kid_delegated === true ||
    user.is_kid_delegated === true;
  if (isKid) {
    // Kid JWT on a user route → 401 hard. Returning a redirect would
    // leak the route's existence; 401 with a generic body matches
    // requireAuth's behavior.
    return new NextResponse(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    });
  }
}
```

(Exact placement and the `user` shape access depend on the existing middleware flow at lines 389-394 where `user` is conditionally fetched. The implementer threads the kid-check through that conditional path — don't fetch the user unconditionally; preserve the public-route bypass that avoids the GoTrue round-trip.)

### 5.3 `account/delete` and `login-cancel-deletion` — inline `is_kid_delegated` reject

`web/src/app/api/account/delete/route.js` and `web/src/app/api/account/login-cancel-deletion/route.js` — these routes bypass `requireAuth` (per the audit they have inline auth flows). Add inline `is_kid_delegated` reject at the top of each handler:

```js
// Read the bearer token directly:
const authHeader = request.headers.get('authorization') || '';
const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;
if (token) {
  // Decode without verifying — this is just to gate kid-vs-user before the
  // real Supabase verify happens later. Verify happens elsewhere; this is
  // a fast pre-check, not a security boundary.
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    if (payload.is_kid_delegated === true || payload.kid_profile_id) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
  } catch {
    // Malformed token — let the downstream auth handle it.
  }
}
```

(Better: refactor both routes to call `requireAuth(supabase, { kindAllowed: 'user' })` and rely on the central gate. If the inline auth shape can be unified with the helper, do so. If not, the inline reject above is the minimal fix.)

### Q3b coordination

**Don't merge until:**
- **S1** ships the RPC kid-rejects (~25 RPCs gain `is_kid_delegated()` checks) + restrictive `users` insert/update RLS.
- **S10** ships the kids/pair issuer flip (kids JWTs issued by Supabase auth, not the legacy custom-issuer path that bypassed `verifyBearerToken` at `lib/auth.js:31-72`).

**The flip becomes safe ONLY when all three sessions ship together.** Build the diff, smoke-test on a branch, hold the merge until S1 and S10 are ready.

**Integration test** (write before merge): forge a kid JWT (test-only, with `is_kid_delegated=true` + valid signature against the test JWT secret) and POST it against ~10 EXPECTED-USER routes:
- `/api/messages` (S5 surface) — must 401.
- `/api/follows` (S5) — must 401.
- `/api/comments/<id>/vote` (S5) — must 401.
- `/api/account/delete` (S3) — must 401.
- `/api/account/login-cancel-deletion` (S3) — must 401.
- `/api/auth/send-magic-link` (S3) — must 401 if the route auths the caller (it doesn't currently — public submit; verify the planner pass).
- `/api/billing/...` (S4) — must 401.
- `/api/admin/...` (S6) — must 401.
- `/api/kids/list` (S10) — must allow (kid-route).
- `/messages` page (S5/S7 page) — middleware redirects.

A test that exercises this set runs as part of the post-impl review. The test code lives wherever the project's integration-test harness is (likely under `web/tests/` or similar — out of S3 scope to design).

**Dependencies.** S1 (RPC kid-rejects + RLS) + S10 (issuer flip).

**Verification.**
1. With kid JWT on user route → 401 from middleware (does not reach the route handler).
2. With user JWT on user route → normal behavior.
3. With kid JWT on `/api/kids/list` → allowed (kid route).
4. `requireAuth` callers without explicit `kindAllowed` continue to behave (default 'user' matches legacy expectation).
5. Integration test (above) passes 10/10.

**Multi-agent shipping process.** **Mandatory full 4 pre + 2 post.** Adversary probes: JWT confusion attack (claim aliasing, where a user JWT happens to have a `kid_profile_id` field set — should still treat as user since `is_kid_delegated=true` is the dispositive claim), cookie-vs-bearer asymmetry (cookie session never goes through the kids/pair issuer, so `is_kid_delegated` on a cookie session is always undefined — confirm), kid-allowlist path-traversal (e.g., `/kids/../profile` — Next.js normalizes paths, but reviewer confirms by hammering edge cases).

---

### S3-§D5 — `@admin-verified` marker remnant in `middleware.js` 🟩 8df73d2

- **ID:** S3-§D5
- **Title:** Rephrase the `@admin-verified` comment at `middleware.js:267` (memory-rule violation)
- **Source:** Moved here from `Session_06_Admin.md` S6-Cleanup-§D5 because the file is S3-owned. Original audit: Cleanup §D5. Memory: `feedback_admin_marker_dropped` — retired 2026-04-23, 77 markers + CLAUDE.md lock-rule retired; **DO NOT REINTRODUCE.**
- **Severity:** P3 (cosmetic; comment-only).
- **Status:** 🟩 8df73d2.
- **File:line current state (verified 2026-04-27):**
  - `web/src/middleware.js:267` — comment: "share the prefix. Both legacy pages carried @admin-verified markers;"
- **Why it matters:** Memory rule retired the `@admin-verified` marker entirely. The comment is a stale reference to a concept that no longer exists in the codebase's vocabulary; future readers will assume the marker is still meaningful and either restore the lock-rule or get confused.
- **The fix:** Rephrase the comment without referencing the marker. Suggested wording: "Both legacy pages were under the admin role-gate;" or simpler "Both legacy pages share the admin prefix and are role-gated." No code change — comment-only edit.
- **Companion edit (S6-owned, NOT in this slice):** `web/src/app/admin/pipeline/runs/page.tsx:19` — admin-shell file, S6 owns the rephrase there. S3 ships the middleware comment; S6 ships the admin-page comment in the same window so the audit closes together.
- **Verification:** `grep -rn "@admin-verified" web/src/` returns zero hits across the entire web/src tree (post-S6 ship).
- **Multi-agent process:** 1 implementer + 1 reviewer (comment-only — no security/correctness reviewer needed).
- **Coordination:** S6-Cleanup-§D5 holds a tracker stub pointing here.

---

## 6. Deferred / informational

These items don't ship in S3 but are tracked here so the session is self-contained.

### Owner-side action items (out-of-band)

- **Q2-h** — Update Supabase email templates in the Supabase Dashboard. Owner-only.
- **Q2a** — Confirmed: Confirm-email setting in Supabase stays DISABLED. No action.
- **Stripe price archival** — out of S3 scope; tracked under S4.
- **NCMEC ESP registration** — owner paperwork; tracked under panel §2.1.
- **Apple Developer console walkthrough** — pending owner-scheduled session.
- **AdSense submission** — owner action.

### Hand-offs to peer sessions

- **A22 — "Open verify-email" engineer copy** at `web/src/app/story/[slug]/page.tsx:1401` — **S7-owned**. Hand off to S7. Not in S3.
- **A127 (kids slice)** — `web/src/app/api/kids/[id]/advance-band/route.ts:161` hardcoded site-URL fallback — **S10-owned**. Hand off to S10.
- **Q1b (welcome carousel `isBetaOwnerLinkSignup`)** — `web/src/app/welcome/page.tsx:106` — **S7-owned**. Hand off to S7 once S1 migration lands.
- **`requireVerifiedEmail` helper deletion** — keep exported until all sessions drop their callers; final-pass deletion is a cross-session cleanup, schedule after S5 / S6 / S7 / S8 finish their slices.
- **CI lint rule blocking raw `windowSec: \d+`** — out-of-S3-scope build-tooling work. Flag for the build-tooling sweep.
- **iOS feature flag location for OAuth hide** — if a flags module doesn't exist, agree on a location with S6 / S7. Otherwise hardcode at the top of `/login` and `/signup` with a comment.

### Items dissolved by Q1b / Q2

- **TODO2 T22** (iOS pick-username under magic-link) — handled by Q2-e + iOS contract.
- **TODO2 T23** (iOS sign-in audit/lockout) — handled by Q2-f. Web's hardened multi-step path collapses to send-magic-link.
- **TODO2 T200** (signup username retry loop) — dissolved structurally (no `auth.signUp` call).
- **TODO2 T252** (username availability race vs `auth.signUp`) — dissolved (UNIQUE constraint at the DB layer is the only enforcement).
- **TODO2 T320** (owner-link Pro gutted) — dissolved by Q1b.
- **TODO2 T321** (billing-surface gate) — dissolved by Q1b.
- **TODO2 T345** (Confirm-email + cohort reconciliation) — Q2a-locked DISABLED + zero users to reconcile.

### Items moot under Q2

- **A48** (1-hour TTL claim) — moot; page deleted.
- **A111** (cooldown vs expiry copy) — moot; page deleted.
- **A108** (`/login` attempt counter) — moot; no password attempts.
- **A112** (verify-email "about an hour") — likely moot; page possibly deleted under Q2-b decision.

### Tradeoffs surfaced (none should land as TODOs/HACKs)

- **`requireVerifiedEmail` left exported temporarily** — cross-session cleanup. Track in this section, not as a TODO comment.
- **`/welcome/pick-username` route lives under `/welcome/`** which is S7's territory in some senses but needs a new page. Coordinate with S7 if a path conflict surfaces.

---

## 7. Final verification — completion checklist

Mark each box only after the verification command output is captured in the implementer's commit body. Empty checkboxes are not green.

### Foundation libs

- [ ] `web/src/lib/rateLimits.ts` exists with all 7+ keys; `npm run typecheck` passes.
- [ ] `grep -rnE "windowSec:\s*\d+" web/src/app/api/auth web/src/app/api/account` returns zero hits.
- [ ] `web/src/lib/cors.js` exists; exports `ALLOWED_ORIGINS` + `isAllowedOrigin()` + `CORS_ALLOW_METHODS` + `CORS_ALLOW_HEADERS`.
- [ ] `grep -rn "veritypost\.com" web/src/middleware.js web/src/app/api/account/delete/route.js web/src/app/api/account/login-cancel-deletion/route.js` returns zero hits.

### Privacy / correctness sweep

- [ ] `account/delete` revokes `public.sessions` rows OR `anonymize_user` RPC does it (ship coordinated with S1; verified by SQL probe on a deleted test user).
- [ ] `truncateIpV4` returns `null` on malformed input (test cases 1-7 from § 3.S3-A72 pass).
- [ ] `web/src/lib/email.js` imports `getSiteUrlOrNull` from `lib/siteUrl`; `grep -n "veritypost\.com" web/src/lib/email.js` returns zero hits.

### Q2 magic-link migration

- [ ] `web/src/app/api/auth/send-magic-link/route.js` exists; POST returns generic 200 across all input variants.
- [ ] `/login` rebuilt as single email-only form (~150 lines vs prior ~700).
- [ ] `/signup` is a real route (200 with form, NOT a redirect).
- [ ] Apple + Google OAuth buttons hidden behind feature flag (default false); code preserved.
- [ ] `/welcome/pick-username` exists; debounced `/api/auth/check-username` with 250ms; UNIQUE-violation race shows 409 + retry copy.
- [ ] `/api/auth/check-username` is session-scoped (anonymous = 401); response is `{available: boolean}` only.
- [ ] iOS contract published as a header comment in `/api/auth/send-magic-link/route.js`.
- [ ] `/forgot-password` redirects to `/login?recovered=1`; `/api/auth/reset-password` route file deleted.
- [ ] `grep -rn "signInWithPassword\|auth\\.signUp" web/src/app web/src/lib` returns zero hits in S3-owned files.
- [ ] `grep -rn "check-email\|resolve-username" web/src/` returns zero hits.
- [ ] `/api/auth/check-email` and `/api/auth/resolve-username` route files deleted; both return 404.
- [ ] `/api/auth/login`, `/api/auth/login-precheck`, `/api/auth/login-failed`, `/api/auth/signup`, `/api/auth/signup-rollback`, `/api/auth/verify-password`, `/api/auth/resend-verification`, `/api/auth/reset-password` deleted (or only the ones the implementer pass confirmed dead — investigator quotes the actual usage; some may stay if S1 / S5 / S6 / S7 / S9 / S10 still reference them, in which case those references are flagged as cross-session hand-offs).
- [ ] Magic-link end-to-end works on web (manual smoke: enter email on `/login` → receive email → click link → land on `/welcome/pick-username` if no username → pick → land on Home).

### Graduate-kid hardening

- [ ] `/api/auth/graduate-kid/claim` rate-limited per-IP (10/hour) + per-token (5/min via SHA-256 hash key).
- [ ] All token-failure paths return identical 400 body `{error: "This signup link isn't valid. Please ask your parent for a new one."}`.
- [ ] `audit_log` rows captured with `reason='token_expired'|'token_invalid'|'token_already_used'|'kid_resolution_failed'`.
- [ ] End-to-end smoke: parent generates link → kid claims → success. Same with expired token → 400 generic body, audit log shows real reason.

### Race / privacy fixes

- [ ] `/signup/expert` no longer flashes step 1 to authed users (skeleton-then-step-2).

### Q1b-AUTH (pending S1)

- [ ] After S1 migration drops `requires_verified` column: `grep -rn "requires_verified" web/src/lib web/src/app/api/auth web/src/app/api/account` returns zero hits in S3-owned files.
- [ ] After S1 migration: `grep -rn "requireVerifiedEmail" web/src/app/api/auth web/src/app/api/account` returns zero hits in S3-owned files (callers removed; helper itself stays exported until all sessions clean up).

### Q3b kid-blind fix (pending S1 + S10)

- [ ] `lib/auth.js` exports `requireAuth(client, { kindAllowed })` and `requirePermission(key, client, { kindAllowed })` with default `'user'`.
- [ ] `getUser()` surfaces `user.kind`, `user.kid_profile_id`, `user.parent_user_id`.
- [ ] `middleware.js` rejects kid JWTs (401) on every path except the kid-allowlist.
- [ ] `/api/account/delete` and `/api/account/login-cancel-deletion` reject kid JWTs (401) before any handler logic.
- [ ] Integration test forges a kid JWT against 10 EXPECTED-USER routes; all 10 return 401.
- [ ] Co-shipped with S1's RPC kid-rejects + S10's kids/pair issuer flip — confirmed all three are merged in the same release window.

### Commit hygiene

- [ ] Every commit tagged `[S3-Tnnn]` or `[S3-Q2x]` or umbrella `[S3-Q2]`.
- [ ] Every shipped item marked 🟩 in this file with a short SHA inline.
- [ ] Deferred-cleanup section (§ 6) updated with any new hand-offs surfaced during execution.

### Out-of-scope verification (negative)

- [ ] No edits outside the owned-paths list in § 0.2.
- [ ] No iOS file edits (`VerityPost/**` and `VerityPostKids/**` untouched — S9 / S10 territory).
- [ ] No edits to billing / comments / admin / public-web / profile surfaces.
- [ ] No `TODO`, `HACK`, `FIXME`, or force-unwrap-as-crutch comments introduced.
- [ ] No "coming soon", "in the next pass", or other timeline copy in any user-visible string (per memory `feedback_no_user_facing_timelines`).

---

## 8. Closeout

When every checkbox in § 7 is green:

1. Update `Sessions/00_INDEX.md` to mark Session 3 ✅ shipped with the cumulative SHA range.
2. Update memory `project_session_state_2026-04-27_autonomous_run.md` (or whichever session-state memory is current) with the Session 3 closeout summary.
3. Push to remote. Don't merge to main without owner sign-off — this session touches the auth surface, which is launch-blocking.
4. After merge: run the integration test from § 5.Q3b once more in production to confirm the kid-blind fix holds with real Supabase JWTs, not just the test fixtures.
5. Mark this file 🟩 SHIPPED at the top.
