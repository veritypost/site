# Session K — concern #32 (admin audit-failure systemic fix)

Continue with `story_cleanup_prompt.md`. Work concern #32 in this session,
**alone — touches many admin routes**.

**RUN ORDER: Wave 3 — start ONLY after Session J (#31 mute outlet) has
pushed and merged, AND all Wave 1 sessions (F, G, H, I) are done.** This is
the last session in the cleanup loop.

## #32 — Admin routes: audit failures crash mutation responses

`recordAdminAction` from `web/src/lib/adminMutation.ts` can throw
`Error('audit_failed')` on actor-resolution failure or fallback-insert
failure (lines 243–254). Many admin mutation routes call it via plain
`await` outside any try/catch — when it throws, Next.js renders an HTML 500
even though the underlying DB mutation already committed. The client sees a
non-JSON response and falls back to whatever generic toast string the call
site uses, leading the operator to believe the action failed when it
actually succeeded.

Concern #3 patched the move-item route in isolation (commit `64f58d0`); the
rest of the admin surface is still exposed.

## Owner-locked approach: option A (single-place fix)

The state file said two approaches were possible:
- (a) update `recordAdminAction` itself to log + capture instead of throw
  (single-place fix; changes contract for all callers).
- (b) wrap each call site in try/catch (many-place fix).

**Owner picked option A on 2026-05-02 (locked). Implement option A directly
— no need to re-investigate the choice in Stage 1.** Stage 1's job is to
verify the function's current contract, find every call site (so you can
confirm option A doesn't break any of them), and propose the precise edit
to `recordAdminAction`.

## File scope (option A — single-place fix)

Touch:
- `web/src/lib/adminMutation.ts` — change `recordAdminAction` to log +
  Sentry-capture on failure instead of throwing. Keep the function's return
  type stable (returns `void` or whatever it returns now).
- Concern #3's route (`web/src/app/api/admin/newsroom/clusters/[id]/move-item/route.ts`)
  retains its existing try/catch — leave it as belt-and-suspenders or
  remove the now-redundant catch. Decide based on which keeps the file
  cleaner.

If option B is chosen instead, scope expands to every admin mutation route
that calls `recordAdminAction` — grep for it and wrap each call site.

## Locked decisions in scope

- "Genuine fixes, never patches" — option A is the genuine fix; option B is
  many patches.
- Admin mutations must succeed even when audit logging fails (the documented
  contract per concern #3's resolution block).

## Concern bookkeeping

- Skip RESOLVED: #1–#5, #7, #9, #10, #12, #14–#27, #30, #33.
- Wave 1 sessions resolve #6, #8, #11, #13, #28, #29, #34. Wave 2 (Session J)
  resolves #31. All should be RESOLVED before you start.
- Verify before starting:
  ```
  grep -E "^### (6|8|11|13|28|29|31|34)\." -A1 \
    /Users/veritypost/Desktop/verity-post/story_cleanup_state.md
  ```
  All should show `Status: RESOLVED`. If any is still IN_PROGRESS or
  PENDING, **STOP** and report back to the owner.

## Parallel coordination

**You run alone.** No other sessions are active by the time you start. After
this session, the entire `story_cleanup_state.md` should be one of
{RESOLVED, DEFERRED} for every concern #1–#34.

Push when ready: `git push origin main`.
