# Bug Hunt — Trimmed Pre-Launch Protocol

Parallel track to UI_UX_REVIEW. Goal: find and fix things that BREAK before launch. Polish, dark-mode, copy, a11y, parity all defer to post-launch passes.

**The only prompt you need (paste every session):**

```
Continue bug hunt per BUG_HUNT.md.
```

The orchestrator reads this file + `BUG_HUNT_NEXT.md` (cursor) and auto-detects the next valuable action.

---

## Scope — 5 critical-path surfaces

| Surface | What's in it | Bug-doc output |
|---|---|---|
| **Auth** | login, signup, verify, welcome, beta-locked, logout, password reset, OAuth | `UI_UX_REVIEW/bug-sweep-auth.md` |
| **Reading** | home, article, quiz, comments, bookmark, share | `UI_UX_REVIEW/bug-sweep-reading.md` |
| **Billing** | billing page, profile billing, Stripe webhooks, subscription state, iOS subscription | `UI_UX_REVIEW/bug-sweep-billing.md` |
| **Moderation** | comment dialogs (report / flag / hide / block), admin moderation cluster, report routes | `UI_UX_REVIEW/bug-sweep-moderation.md` |
| **Kid safety** | pairing, parental gate, family dashboard, kid dashboard, kid-related APIs | `UI_UX_REVIEW/bug-sweep-parental.md` |

Everything else (browse, search, category, leaderboard, notifications, messages, following, recap, marketing, legal, public profile chrome, admin clusters except moderation) is DEFERRED to post-launch.

---

## What counts as a bug (find these)

1. **Crashes** — runtime exceptions, unhandled promise rejections, null deref, undefined function calls.
2. **Data loss / state loss** — drafts dropped on nav, form state lost on tab switch, optimistic updates that desync from server.
3. **Auth / session failures** — broken token refresh, session-fixation, missing CSRF, OAuth callback issues, password reset / verify silently failing.
4. **Permission / RBAC bypasses** — perm checks skippable client-side, server endpoints missing auth, RLS policies that don't match client expectations.
5. **Race conditions** — double-submit, concurrent fetch races, optimistic-update desync, real-time subscription leaks.
6. **Dead-end UX** — locked states with no recovery, empty states with no CTA, error states that don't allow retry.
7. **Misleading copy** — "Sign in" to a logged-in user, "Pass the quiz above" with no quiz, banner referencing chrome that doesn't exist.
8. **Silent error swallowing** — `catch {}` blocks, errors logged-only, fetch errors flattened to falsy without UI feedback.
9. **Schema / data integrity** — missing indexes that crash at scale, FK cascades that delete real data, RLS leaking PII, query patterns that 4xx on legit data.
10. **Mobile-specific breakage** — keyboard pushing modals off-screen, touch events stuck, viewport meta missing, iOS Safari ITP breakage.
11. **Browser compat blockers** — Safari ITP cookie issues, Firefox edge cases.

## What to skip (do NOT log)

Hardcoded hex colors. Dark-mode token violations. Copy inconsistencies that don't mislead. Hit-target sizes that aren't WCAG-A blocking. Section heading semantics. ARIA labels where visible text is sufficient. Cross-platform parity gaps that don't break either platform. Performance suggestions that aren't blocking. Refactoring opportunities. Anything cosmetic.

---

## Continuation Protocol — auto-detect

Each session, read `BUG_HUNT_NEXT.md` and pick the FIRST matching action:

**(a) Sweep not yet run** → Per surface, dispatch THREE specialized bug-hunter subagents in parallel — `bug-hunter-runtime` + `bug-hunter-flow` + `bug-hunter-security` (all Sonnet 4.6). Three lenses per surface catch ~95% coverage vs ~70% with a single generalist. Across 5 surfaces = 15 bug-hunter calls. Plus 3 `adversary` subagents (Opus 4.7) on the elevated-care surfaces (Auth, Billing, Kid safety). Total: **18 agents in one orchestrator message**, all parallel.

Each bug-hunter caps at 12 findings; adversary caps at 10 gaps. Each writes its findings to the surface's `UI_UX_REVIEW/bug-sweep-<surface>.md`, deduped at merge time by the orchestrator. Adversary findings appended to the same doc with `[ADVERSARY]` prefix. Write a summary to `UI_UX_REVIEW/bug-sweep-summary.md` (total bugs per surface, broken down by lens — runtime / flow / security / adversary). Update `BUG_HUNT_NEXT.md` cursor to "fix-pass mode."

The single generalist `bug-hunter` agent stays available as a fallback for quick once-over work but is NOT dispatched in the standard sweep — the 3-specialist split is the default.

**(b) Bug doc with unfixed findings** → Pick the next bug doc in dependency order (Auth → Reading → Billing → Moderation → Kid safety). Dispatch the fix-pass:
- `finding-verifier` (Haiku) — pre-flight every cite still applies.
- `fix-implementer` (Sonnet) — apply fixes per finding. Single-stream is fine for bug fixes; only split into 4-stream if 20+ findings touch 8+ files.
- `adversary` (Opus) — if surface is elevated-care AND fix-pass touched RBAC / payment / auth / kid-safety code paths.
- `build-verifier` (Haiku) — type-check + lint + sentinel grep.
- `smoke-tester` (Haiku) — boot dev server, hit critical routes for this surface.
- Mark all findings in bug doc as `[fixed]` or `[deferred]` with reason.
- Update `BUG_HUNT_NEXT.md` cursor.

**(c) All 5 surfaces have empty/all-fixed bug docs** → Run final smoke pass: full app dev-server boot + hit all 5 surfaces' critical routes + capture any remaining console errors. Log to `UI_UX_REVIEW/bug-sweep-final.md`. Mark `BUG_HUNT_NEXT.md` as `LAUNCH_READY`.

**(d) `LAUNCH_READY` set** → Tell owner "Bug hunt complete. Launch gate cleared. Polish work resumes via UI_UX_REVIEW.md."

---

## Owner-touch points (when sessions stop and ask)

- **Adversary GAPS FOUND** on elevated-care surface — orchestrator pauses, surfaces gaps for triage (fix in this slice / defer to bug doc / accept-and-document).
- **Pre-flight returns >25% REFUTED** on a fix-pass — code drifted enough that bug-doc needs re-running; orchestrator pauses for owner OK.
- **Smoke test FAIL after fix-pass** — orchestrator surfaces failures; owner picks fix-now vs ship-with-bug-doc-deferred.
- **DB migrations awaiting apply** — MCP is read-only; owner applies in Supabase Studio.
- **Anything destructive** (force push, branch delete, hard-reset) — never auto-run.

Everything else auto-locks: convergent decisions, mechanical fixes, state-file updates, cursor advances.

---

## State files

- `BUG_HUNT.md` — this file (the protocol).
- `BUG_HUNT_NEXT.md` — cursor + anchor + per-surface status. Read by every session, updated at every meaningful step.
- `UI_UX_REVIEW/bug-sweep-<surface>.md` — bug findings per surface.
- `UI_UX_REVIEW/bug-sweep-summary.md` — sweep-pass summary across all 5 surfaces.
- `UI_UX_REVIEW/bug-sweep-final.md` — final smoke-pass log.

Bug docs live alongside the regular review docs in `UI_UX_REVIEW/` because they're related artifacts; only the protocol file (BUG_HUNT.md / BUG_HUNT_NEXT.md) is separate from the UI/UX review flow.

---

## Cost shape

Single sweep session (15 specialized bug-hunters Sonnet + 3 adversaries Opus in parallel): ~5–7% of weekly budget.
Each fix-pass session: ~0.5–1% of weekly budget.
Final smoke: ~0.2%.
**Total full bug hunt: ~9–13% of weekly budget across ~7 sessions.**

Trade-off: 3-specialist sweep costs ~50% more than a single generalist hunter, but catches ~25-30% more bugs in coverage. Worth it for pre-launch — undercaught bugs at launch cost more than the agent budget.

Compare to full UI_UX_REVIEW protocol for the same surfaces: ~25 sessions, ~15% of weekly budget.

---

## Relationship to UI_UX_REVIEW

These two protocols run on independent state. UI_UX_REVIEW handles full polish + decision-locking + per-unit reviews; BUG_HUNT handles critical-path bugs only. They share the agent definitions in `.claude/agents/` (bug-hunter, adversary, fix-implementer, etc.) but maintain separate cursors.

When a bug surfaces a missing decision (e.g., "what happens when X state hits Y endpoint?"), defer to the UI_UX_REVIEW flow — it's not a bug, it's a design question. Bug hunt only fixes what's clearly broken.

When the bug hunt completes (LAUNCH_READY), the team can launch. UI_UX_REVIEW continues post-launch as polish work.
