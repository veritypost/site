# Session 0 — Autonomous Quick Wins

**Run when owner says go. No decisions inside. No prerequisites.**

5 pure-mechanical fixes. Each is a one-or-two-line change with the correct answer being unambiguous from the codebase patterns.

## Fixes

### A1 — `generate_kid_pair_code` random() → gen_random_bytes()
- **Source:** PM-11 P0
- **File:** Supabase migration; the function definition lives in DB
- **Change:** replace `random()` derivation with `gen_random_bytes(...)` (pgcrypto is already installed). Use the same alphabet and length as current.
- **Verify:** `mcp__supabase__execute_sql` to confirm `pg_get_functiondef` shows `gen_random_bytes`.

### A2 — `_SingleDoorForm.tsx:106` session check before redirect
- **Source:** PM-1 P0
- **File:** `web/src/app/login/_SingleDoorForm.tsx:106`
- **Change:** before `router.replace('/')`, check the auth state. If no session was actually created, render an error and stop.
- **Verify:** smoke-test: enter wrong OTP → should see error, not be on home as anon.

### A3 — `/preview` token timing-safe compare
- **Source:** PM-1 P1
- **File:** `web/src/app/preview/route.ts`
- **Change:** replace `tokenA !== tokenB` with `crypto.timingSafeEqual(Buffer.from(tokenA), Buffer.from(tokenB))` after length pre-check.
- **Verify:** route still works for valid token.

### A4 — OTP audit-log raw-error redaction
- **Source:** PM-1 P1
- **File:** the verify-magic-code or send-magic-link audit insert site (PM-1 cited it)
- **Change:** instead of inserting the raw upstream error string, map known errors to a small set of codes; insert the code, not the verbatim message.
- **Verify:** trigger an OTP error path, confirm audit row contains a code not the raw message.

### A5 — `BookmarksSection` invokes useToast on failure
- **Source:** PM-2 P1
- **File:** `web/src/app/profile/_sections/BookmarksSection.tsx`
- **Change:** on the failure path, invoke the imported `useToast` with an error message and render a Retry CTA. Right now the import is dead and the failure path is silent.
- **Verify:** force-fail the bookmarks fetch in dev; toast appears; Retry CTA visible.

## Process

1. **Pre-impl** — verify each finding still applies on disk. Drop refuted.
2. **Apply** — one PR per fix, OR one bundled commit. Owner pick. Default: one bundled commit titled "Session 0 — autonomous quick wins (5 fixes)".
3. **Build-verifier** — type-check + lint web; for A1 confirm via Supabase MCP.
4. **Smoke-test** — exercise A2 (wrong OTP), A5 (bookmarks failure), A3 (preview with wrong token), A1 (kid pair-code regenerates with new entropy).
5. **No adversary needed.** All 5 are surgical with no architectural impact.

## Done definition

- All 5 closed or refuted with evidence.
- Each closed finding gets `> CLOSED in Session 0 — commit <hash>` in `REVIEW_REPORT.md`.
- `## Status` block appended below.

## Status

### 2026-05-03 — Session 0 fired (commit `0ed48a4`)

- A1 generate_kid_pair_code: migration written at `supabase/migrations/20260503000008_generate_kid_pair_code_csprng.sql`. **Not yet applied to live DB — Supabase MCP is read-only this session; owner must run `supabase db push` or paste the migration into the dashboard SQL editor.** Until applied, the live `pg_proc.generate_kid_pair_code` body still uses `random()`. Once applied, verify with `SELECT pg_get_functiondef('public.generate_kid_pair_code'::regproc)` showing `gen_random_bytes`.
- A2 `_SingleDoorForm.tsx`: post-200 `supabase.auth.getSession()` probe; null session surfaces the existing "Invalid code" copy and stops the redirect.
- A3 `/preview`: length pre-check + `crypto.timingSafeEqual`.
- A4 `verify-magic-code` audit log: closed-set classifier (`expired` / `invalid` / `rate_limited_upstream` / `other` / `no_user`); raw upstream string no longer reaches `audit_log.metadata.reason`.
- A5 `BookmarksSection`: refactored loader into a `useCallback`; failure path fires `toast.error(...)` and renders a Retry button that re-runs the loader.

Build verify: `npx tsc --noEmit` and `npx eslint <changed files>` both pass (EXIT=0). UI smoke not exercised in this autonomous run — bug-class is small and surgical (one-line/few-line changes), but A2 + A5 in particular benefit from a manual click-through (wrong-OTP → see error stays on /login; force-fail bookmarks fetch → toast + Retry visible).

5/5 closed (A1 pending live-DB migration apply).

