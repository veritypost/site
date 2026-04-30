# iOS Bug-Sweep — Program Rulebook

**Started:** (not yet started)
**Covers:** `VerityPost/` (main iOS app) and `VerityPostKids/` (kids iOS app)
**Format reference:** `Conversations/site-bug-sweep/` — same discipline, same slice-status vocabulary, adapted for Swift/SwiftUI.

---

## What this program is

A systematic sweep of every surface in both iOS apps, organized by account type, tier, and permission level. The web surface was swept in `Conversations/site-bug-sweep/` (59 bugs, all shipped). This program applies the same methodology to the iOS layer.

The sweep visits each surface as: signed-out user, signed-in free user, signed-in pro user, signed-in admin, and (for the kids app) kid account with paired parent. It looks for:

- **Silent network failures** — async tasks with empty `catch` blocks or `try?` that discard errors and show empty state or spinner-stuck UI
- **Double-tap / rapid action vectors** — async action handlers with no in-flight guard; buttons that can be tapped before the previous call resolves
- **Missing error + retry states** — views that fall through to empty/skeleton state on network failure with no recovery path
- **Realtime subscription leaks** — Supabase channels opened but not removed on `onDisappear`, leading to multiple subscriptions accumulating across navigation
- **RLS-incompatible queries** — joins that use direct `users!user_id` hints (or similar) that 403 for non-admins; must use `public_profiles_v` or the correct FK hint
- **COPPA/ParentalGate bypass** — any age-gated action in the kids app that can be triggered without `ParentalGateModal` confirmation
- **Optimistic UI without rollback** — state mutations applied before the network call succeeds and not reversed on failure
- **Auth state races** — Keychain token reads or permission checks that fire before the Supabase session is fully restored on cold launch
- **Missing logout cleanup** — push token deregistration, realtime channel teardown, local state wipe on sign-out
- **Memory / retain cycles** — strong `self` captures in `Task { }` closures on views that may be dismissed during the flight

---

## How sessions work

**One slice per session.** Read state, advance by exactly one slice, write state back, stop.

**Investigation first.** Parallel Explore agents read actual Swift files before any findings are surfaced. For every claim — especially about query shapes, realtime channel setup, and auth guards — the agent must quote `file:line`.

**Confirm before implementing.** Any bug fix must be confirmed against the current file before a single line changes. The fix plan quotes the exact file and line.

**6-agent ship pattern applies.** For any implementation session: 4 pre-impl agents (investigator → planner → big-picture reviewer → adversary) + 2 post-impl (TypeScript/Swift build check + adversarial re-read). Non-negotiable. Swift has no compiler-enforced type safety for Supabase query shapes — adversary earns its keep here.

---

## Slice-status vocabulary

Same as `site-bug-sweep`:

- **not-started** — no investigation done yet.
- **investigating** — Explore agents are reading the code; findings not yet surfaced.
- **findings-open** — investigation done; findings surfaced; Q&A in progress if needed.
- **adversarial-review** — main findings pass closed; fresh agent reviewing locked plan.
- **locked** — all issues confirmed, fix plans sealed; ready for implementation.

Issue statuses (within a slice doc):

- **found** — identified; no plan yet.
- **planned** — fix plan confirmed; not yet implemented.
- **shipped** — committed and pushed; commit hash recorded.
- **deferred** — intentionally not fixed; named reason.
- **wont-fix** — investigated; behavior intentional or fix cost exceeds value; named reason.

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/ios-bug-sweep/README.md` (this file)
2. `Conversations/ios-bug-sweep/INDEX.md` (live dashboard)
3. `Conversations/ios-bug-sweep/SESSION_LOG.md` (last 2 entries)
4. `Conversations/ios-bug-sweep/00-system-map.md` (section for this session's slice)
5. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

---

## Slice session protocol

1. Re-read the system map for this slice's section.
2. Spawn parallel Explore agents — read actual Swift files. Agents must quote `file:line` for every claim.
3. Verify query shapes. Any Supabase query that joins a table must be cross-checked against `web/src/types/database.ts` for FK hint correctness. Swift uses string-based PostgREST queries with the same FK hint syntax as the web app.
4. Verify COPPA gates. Any action in the kids app that deletes data, modifies account settings, or makes a purchase must go through `ParentalGateModal`. Check callers.
5. Surface findings — ≤8 bullets, prioritized.
6. Q&A if design decisions are needed — one question at a time.
7. Adversarial review — fresh Explore agent reads confirmed issue list + actual code.
8. Write the slice doc to `slices/<NN>-<name>.md`.
9. Update `INDEX.md` and append `SESSION_LOG.md`.

---

## End-of-session protocol (every session)

Before stopping, in this order:

1. Write or update the slice doc at `slices/<NN>-<name>.md`.
2. Update `INDEX.md` — slice status, last-touched date, cross-surface findings.
3. Append a new entry to `SESSION_LOG.md`.
4. `git push` — all commits must be pushed before stopping.

---

## Swift-specific investigation rules

- **No build tool available.** There is no `swift build` or `xcodebuild` equivalent in this environment. "Zero build errors" must be verified by reading: (a) all call sites of any changed function, (b) the type definition of any changed struct/enum, (c) any protocol conformance that might be affected. Never declare a Swift fix complete without this manual check.
- **Supabase query shapes are untyped.** The Swift Supabase client uses string-based column selects. A wrong column name or FK hint will silently return nil or an empty result — no compile error. Always cross-check against `web/src/types/database.ts`.
- **`@MainActor` and `Task { }` patterns.** State mutations in Swift must happen on the main actor. Async tasks that mutate `@State` or `@Published` without `await MainActor.run { }` (or `@MainActor` annotation) are a runtime crash risk.
- **Kids app COPPA rule is absolute.** `ParentalGateModal` must gate every destructive or account-modifying action in the kids app. No exceptions. No wont-fix for a missing gate.

---

## FK hint rule (inherited from site-bug-sweep)

Any Supabase `.select()` in Swift that uses a `!foreign_key_name` hint must be cross-checked against `web/src/types/database.ts` under the `foreignKeyName:` field. The schema uses `fk_` prefixed names, never the auto-generated `_fkey` suffix. A broken FK hint silently returns no rows.

Known-fixed mismatches (do not re-investigate as open issues):

| Old (wrong) | Correct | Fixed in |
|---|---|---|
| `users!user_id` (StoryDetailView realtime) | `public_profiles_v` | article-lifecycle session 9 |

---

## What gets locked vs. deferred

- **Lock:** confirmed bug, root cause, fix plan, file:line.
- **Defer (named):** owner says later, or fix requires a design decision first.
- **Won't-fix (named):** behavior intentional or fix cost exceeds value — must be named.

---

## Files in this program

```
Conversations/ios-bug-sweep/
├── README.md               ← this file (rules)
├── INDEX.md                ← live dashboard (slice statuses)
├── SESSION_LOG.md          ← append-only chronological log
├── 00-system-map.md        ← full iOS architecture reference
└── slices/
    ├── 01-auth-session.md
    ├── 02-nav-home-feed.md
    ├── 03-article-reading.md
    ├── 04-discovery.md
    ├── 05-social-engagement.md
    ├── 06-messaging.md
    ├── 07-profile-settings-push.md
    ├── 08-billing-subscription.md
    ├── 09-family-kids-bridge.md
    ├── 10-kids-auth-pairing.md
    ├── 11-kids-home-reading.md
    ├── 12-kids-quiz-gamification.md
    └── 13-kids-profile-parental-controls.md
```
