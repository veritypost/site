# Next session handoff

**Last session closed:** 2026-04-20 late-evening extended (second pass).
**Pick up from:** local `main`, 25 commits ahead of `origin/main` (`4d3f7bc`). **NOT pushed.**

Owner explicitly held off on `git push` pending smoke-test. Do not push without asking.

---

## TL;DR — do this first

1. Read CLAUDE.md. Then STATUS.md. Then **this file**. Then top of TASKS.md.
2. Verify the state:
   ```
   git log --oneline origin/main..HEAD | head -30
   git status
   ```
   Working tree clean. 25 commits ahead.
3. Owner-side work is documented in `docs/runbooks/DEPLOY_PREP.md` — point them at it when ready.
4. Cleanest dev pick: **T-019 residual (12 two-wide cases, product decision needed)** — see §"What's next" below.

---

## What shipped in the 2026-04-20 late-evening extended session

15+ tasks closed across 5 batches. Counts: P0 9→6, P1 25→21, P2 33→29, Total 93→86. SECURITY 12→9, CODE 23→20, DB-DRIFT 19→17.

| Commit range | Batch | Tasks |
|---|---|---|
| `c015c46` → `7a1764d` | T-005 (7 sub-commits) | Admin direct-writes class closed (16 pages, 20+ new /api/admin routes, shared lib/adminMutation.ts, reviewer-APPROVED) |
| `3089b9d` | T-005 follow-ups | T-102..T-106 filed |
| `3f60ed1` `24f2e9e` | T-003 | rate_limits DB-backed via `policyKey` arg (27 files, 31 sites) + schema/101 seed |
| `412b4b7` | Seed batch | T-012 + T-014 + T-015 (schema/102, 103, 104) |
| `a3713e1` `309d259` `949a899` | Batch A — error hygiene | T-010 dev half + T-013 (115-site err.message sweep) + T-070 + T-073 + T-076 |
| `61b0d3b` `36386a9` `e08fcdb` `053716b` | Batch B — hardcoded drift | T-017 + T-018 (partial) + T-056 + T-102 + T-103 + T-019 (helpers) |
| `c38aed5` | Batch D — owner runbook | `docs/runbooks/DEPLOY_PREP.md` |
| `ba2bc1c` `f944551` | T-019 partial sweep | 16 admin pages migrated to frozen Sets; 2 mislabeled local `MOD_ROLES` consts renamed (one was ADMIN_ROLES, one was EDITOR_ROLES); 14 residuals remain (12 two-wide + 2 bespoke) |

**Helpers shipped:**
- `web/src/lib/adminMutation.ts` — canonical admin-mutation shape
- `web/src/lib/siteUrl.js` — prod-throw fallback
- `web/src/lib/plans.js` — `getPlanLimit`, `getPlanLimitValue` (plan_features-backed)
- `web/src/lib/roles.js` — `getRoles`, `getRoleNames`, `rolesUpTo`, `rolesAtLeast`
- `web/src/lib/rateLimit.js` — `policyKey` arg + `getRateLimit`
- `web/src/lib/apiErrors.js` — now adopted at 113 call-sites

**Seed SQLs awaiting owner:** `schema/101..104`. All idempotent.

---

## What's next — priority order

### #1 — T-019 residual (12 two-wide cases) — THE CLEANEST NEXT PICK

12 files use `['owner', 'admin']` (2-wide, missing superadmin). Everywhere else in the codebase, superadmin is treated as a strict superset of admin (`ADMIN_ROLES` = 3 wide). The consistent exclusion across 12 files is statistically a copy-paste bug, not 12 independent intentional decisions — but confirming that is a **product decision** the owner should make.

**Files:**
```
admin/reader/page.tsx:106
admin/words/page.tsx:57
admin/plans/page.tsx:100
admin/email-templates/page.tsx:63
admin/features/page.tsx:159
admin/cohorts/page.tsx:157
admin/stories/page.tsx:87    (const allowed = new Set([...]))
admin/support/page.tsx:215
admin/story-manager/page.tsx:162
admin/streaks/page.tsx:83
admin/webhooks/page.tsx:95
admin/promo/page.tsx:89
```

**Approach:**
- Ask the owner first: "Should superadmin have access to {reader config, word lists, plan editing, email templates, feature flags, cohorts, stories, support, story-manager, streaks, webhooks, promos}?" If yes → swap all 12 to `ADMIN_ROLES.has()` in one commit. If mixed → per-file review.
- Default assumption (if owner says "yes to all"): mechanical swap, ~15 min, closes T-019 fully.

### #2 — T-018 residual (2 files, refactor not swap)

- `admin/pipeline/page.tsx:42` — `ALL_CATEGORIES` module-scope const, used 5× in the component. Needs refactor to load from `categories` table into state.
- `admin/cohorts/page.tsx:95` — inline `options: ['Any', 'Technology', ...]` inside a module-scope `FILTER_CATEGORIES` const. Needs restructuring or lazy-evaluation.

Each ~30-45 min (not purely mechanical). Pattern: mirror admin/story-manager which loaded categories on mount (see commit `e08fcdb`).

### #3 — T-016 residual (profile/settings + admin/subscriptions)

Both pages still read `PRICING`, `TIERS`, `maxKids`, `TIER_ORDER`, `formatCents` from `lib/plans.js`. profile/settings is 3800 lines. admin/subscriptions has a complex upgrade UI. Save for fresh context.

### Batch E — Auth surface small wins (1 session)

T-025 Retry-After header sweep, T-068 auth/callback rawNext, T-077 apply-to-expert confirmation, T-080 sanitizeIlikeTerm escape. Small and bounded.

### Batch C — Kid iOS hardening (needs xcodebuild)

T-043 Dynamic Type, T-044 KidsAppState dual-source, T-045 PIN brute-force, T-046 kid-pair JWT verify. All require xcodebuild verification.

### Owner-side

Everything in `docs/runbooks/DEPLOY_PREP.md`. One sitting, ~45-60 min.

---

## Operational discipline — what tightened

1. **Targeted reads** (offset + limit on big files).
2. **Scripts for N-across-files edits** — T-003 did 31 sites, T-013 did 113 sites in single Python invocations.
3. **Typecheck after every batch** — not just at the end. Caught collisions + `@ts-expect-error` placement errors before commit.
4. **Scope-gated agent use** — Explore + reviewer on T-005 only.
5. **Self-assessment at batch boundaries** — introduced at owner's request near session end; helped cap the T-019 sweep at clean swaps only.

### Where slack remains

- Sometimes skip the pre-check grep before an Edit, assume surrounding imports. When it fails, re-read. Not shipping broken, but wasted turns.
- Proposed T-018 residual, started, pivoted when scope revealed. Should have grep-checked first.
- Commit message bodies long on big sub-commits.

---

## Gotchas

All prior gotchas plus:

1. **Mislabeled-local-const pattern:** two files had `const MOD_ROLES = [...]` whose contents were actually ADMIN_ROLES or EDITOR_ROLES. Fixed this session. Watch for the general pattern (local const named one thing but contents are a different canonical Set).

2. **Two-wide `['owner', 'admin']` — product decision, not mechanical.** See T-019 residual above. Don't just swap to ADMIN_ROLES — ask first.

3. **`admin/moderation/page.tsx` has 3 role arrays, only ONE is the standard pattern.** Line 27 (specialty assignable-moderator) and line 121 (moderator-only subset, no admins) are bespoke and correct. Only line 120 was the standard ADMIN_ROLES case — already migrated.

4. **Hand-edits happen in parallel.** During the T-019 sweep this session, several files I hadn't yet touched (admin/ad-campaigns, admin/sponsors, admin/page, admin/permissions, admin/settings, admin/moderation line 120) were hand-edited by the user with the same pattern. Commit them together; don't silently revert. The `git status` after my work showed 20 modified files, of which I'd touched 13.

5. **`admin/pipeline` and `admin/cohorts` categories are module-scope consts, not simple arrays.** T-018 residual needs a refactor, not a swap. I learned this the hard way this session (started, then pivoted).

6. **Python edit scripts break formatting.** T-003 needed a cleanup pass; T-013 passed cleanly because all patterns were self-contained. If you script, budget a formatting re-pass.

7. **`@ts-expect-error` placement is picky.** Has to be immediately before the offending line, not the enclosing statement. tsc after each insertion.

8. **`DestructiveActionConfirm` component writes its own audit client-side.** 8 admin pages now dual-audit. Not a bug, just noise in admin_audit_log. Rip-out-the-component-audit is a follow-up.

9. **Legacy `.js` admin routes still leak err.message verbatim.** ban/route.js, manual-sync/route.js, plan/route.js. Not in T-013 scope (different pattern — catch-block err.message vs. destructure `{error}`). Upgrade as follow-up.

10. **`require_outranks` + `record_admin_action` RPCs not in generated `database.ts`.** Cast pattern in `lib/adminMutation.ts`.

11. **`permissions.xlsx` is the source of truth for permission KEYS, not role→set or plan→set mappings** (those are hardcoded in scripts/import-permissions.js).

---

## Task state at handoff

**Counts:** P0 6 · P1 21 · P2 29 · P3 24 · P4 6 · **Total 86.**
Lens: DB-DRIFT 17 · SCHEMA 5 · SECURITY 9 · IOS 11 · MIGRATION-DRIFT 4 · A11Y 3 · UX 13 · CODE 20.

**All remaining P0 is owner-side.** See `docs/runbooks/DEPLOY_PREP.md`.

**Crucial owner decisions outstanding:**
1. **Push the 25 commits** or smoke-test first.
2. **Apply the 4 seed SQLs** (101..104).
3. **T-019 residual:** should superadmin have access to reader/words/plans/email-templates/features/cohorts/stories/support/story-manager/streaks/webhooks/promos? (Yes → 15-min commit. No → per-file.)
4. **Dashboard / env setup** from DEPLOY_PREP.md §2-§7.

---

## Memory file check

`/Users/veritypost/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md` — refreshed at session end to reflect the T-019 partial sweep and 25-commits-unpushed state.

---

*Doc written 2026-04-20 late-evening extended (second pass) at end of session. Author: Claude Opus 4.7 (1M context).*
