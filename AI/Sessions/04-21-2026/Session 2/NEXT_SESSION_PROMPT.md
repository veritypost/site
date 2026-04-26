# Next-session handoff prompt — from Session 2 (2026-04-21)

Paste the contents of this file into the first message of your next Claude Code session. Briefs the PM on where Session 2 left off.

---

## Start here

You are the Verity Post project manager. Read these in order before doing anything:

1. `Reference/PM_ROLE.md` — your role brief (precedence over CLAUDE.md on scope).
2. `Reference/CLAUDE.md` — project constitution.
3. `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md` — cross-session memory index. Read every linked feedback/project memory file. **New this session:** `feedback_divergence_resolution_4_independent_agents.md` — when 4-agent flow doesn't reach 4/4, dispatch 4 brand-new agents per disputed point; their verdict decides; second round diagnoses why originals diverged. Don't bring technical disputes back to the owner for merits.
4. `Current Projects/FIX_SESSION_1.md` — canonical audit tracker. Item #20 SHIPPED block lands in this session.
5. `Sessions/04-21-2026/Session 2/SESSION_LOG_2026-04-21.md` — full narrative.
6. `Sessions/04-21-2026/Session 2/FOLLOW_UPS_FROM_SHIP_2026-04-21.md` — six new tasks queued from #20.
7. This file.

Then say "Ready" and wait for direction. Do NOT start work until owner speaks.

## What shipped in Session 2 (2026-04-21)

### FIX_SESSION_1 #20 — ESLint + Prettier + Husky landed in `web/`

**5 commits, NOT pushed** (PM held the push for owner review):
- `761c049` — configs + tooling (eslint, prettier, husky deps + scripts + lint-staged + Husky hook).
- `6b7868f` — 23 `react-hooks/rules-of-hooks` inline disables across 3 launch-hide files (recap, recap/[id], welcome) + 1 real fix in `admin/words/page.tsx:203` (ternary-as-statement → if/else, no disable).
- `162ce6d` — autofix sweep (327 files, formatting only, `src/app/admin/` and `src/types/database.ts` excluded).
- `bfff379` — docs (FIX_SESSION_1 #20 SHIPPED block, STATUS dev-tooling section, CLAUDE repo tree update, `.git-blame-ignore-revs`, Session 2 artifacts).
- `2902626` — small follow-up to substitute the real autofix SHA into Session 2 artifacts.

**Final state:** 0 lint errors, 149 warnings. tsc green. next build green (with env stubs). Pre-commit hook proven via smoke test.

### Process work

- **New cross-session memory entry locked in:** `feedback_divergence_resolution_4_independent_agents.md` — see "Start here" #3.
- 4 pre-impl agents found 5 divergences on the #20 plan.
- 13 fresh agents dispatched per the new rule (3 divergences × 4 + 1 verifier on TS version).
- Resolutions: Husky at `web/.husky/` (4/4), `no-img-element` warn (3/1), ship order #20→#16→#17 with admin/ excluded from autofix (4/4), parser v8 not v7 (verifier finding — TS 6.0.3 confirmed real published version).

## Outstanding from #20 (six follow-ups)

See `Sessions/04-21-2026/Session 2/FOLLOW_UPS_FROM_SHIP_2026-04-21.md` for full detail. Headlines:

1. Migrate `Ad.jsx:133` `<img>` to `next/image` — gated on F5/F6 advertiser-host `remotePatterns` decision.
2. Migrate `card/[username]/page.js:110` `<img>` to `next/image` AND `.js`→`.tsx` in same change.
3. Audit 45 pre-existing `// eslint-disable*` directives.
4. Hand-clean 149 residual lint warnings (breakdown in follow-ups doc).
5. After #16 ships: remove `src/app/admin` exclusion from `web/.prettierignore`, run `npm run format`, commit as small admin-only formatting pass.
6. Refactor launch-hide pattern globally — move `if (LAUNCH_HIDE) return null;` AFTER hook declarations across all 11 launch-hides in `Sessions/04-21-2026/Session 1/KILL_SWITCH_INVENTORY_2026-04-21.md`. When each launch-hide site is fixed, the inline `// eslint-disable-next-line` comment from Session 2 comes off in the same diff. Grep `launch-hide pattern; remove when feature unhides` to find all 23 disables.

## What's open and autonomous (safe to pick up next session)

| Pick | Item | Notes |
|---|---|---|
| **Hand-clean 149 lint warnings** (#20 follow-up 4) | Autonomous, batch-able by category. Touches public-facing files — AdSense-review timing risk; consider waiting until AdSense approves. |
| **00-N DR migration reconciliation** | 13 live-DB migrations missing as files in `schema/`. Reconstruct DDL from MCP or git, file into `schema/`, patch `reset_and_rebuild_v2.sql`. Fully autonomous, no public-surface risk. |
| **#20 follow-up 3** (audit 45 eslint-disable directives) | Autonomous. Exploratory. |
| **#16 `as any` cleanup** | 19 sites in 8 admin files. **Admin-lockdown applies** — owner per-file approval needed. After #16: `web/.prettierignore` admin/ exclusion comes off (#20 follow-up 5). |
| **#17 strict mode** | After #16. Bigger refactor. |
| **Refactor launch-hide pattern** (#20 follow-up 6) | Touches 5+ files (potentially more from 11-entry kill-switch inventory). Each needs hook-by-hook verification. Removes 23 inline disables when done. |

## Owner-decisions outstanding (carried from Session 1)

- **#6 bottom nav** — `SHOW_BOTTOM_NAV = false`. Turn back on, and if so what tabs.
- **F3 quiz+discussion kill-switch flip** timing.
- **F4 vs F5 phase decision.**
- **#14 reserved-usernames scope.**
- **F7 §12** — 8 pending decisions.

## Waiting on external parties (no action)

- AdSense approval (3-14 days).
- Apple Dev enrollment approval (1-3+ weeks Org track).
- Google Search Console crawls.

## Durable gotchas discovered Session 2 (don't re-discover)

1. **Husky v9 + non-root packages.** `npx husky init` couldn't auto-detect `.git` from `web/` (looks at cwd, doesn't walk up). Bootstrap manually: create `web/.husky/pre-commit` directly + run `git config core.hooksPath web/.husky`. Hook content needs `cd web && npx lint-staged` (git invokes hooks from repo root, lint-staged needs to find `web/package.json`).
2. **`core.hooksPath` is local git config, not committed.** Anyone cloning the repo needs `cd web && npm install` (fires `prepare`, Husky v9 sets the config) OR manually `git config core.hooksPath web/.husky`. README note worth adding.
3. **`npm run build` needs Supabase env vars at prerender time.** Pre-existing dev-environment quirk, not a regression from #20. Vercel has these in Production. Local dev needs `.env.local` or stub env vars.
4. **TypeScript 6.0.3 in `web/package.json:26` is real**, not a typo. Verified via `node_modules/typescript/package.json:5` + `web/package-lock.json:4391`. `@typescript-eslint/parser@^7` doesn't accept it (peer-dep predates TS 5.6); use `^8` instead.
5. **Next 14's `next lint` only autodiscovers legacy `.eslintrc.*` configs** (verified at `node_modules/next/dist/lib/eslint/runLintCheck.js:134-242`). Flat `eslint.config.js` is NOT autodiscovered. When upgrading to Next 15, `next lint` is being deprecated in favor of running `eslint .` directly — switch the script then.
6. **`@admin-verified` markers are permissions-lockdown flags, not compliance certificates.** Carried from Session 1 — still true.

## Final commit chain (Session 2 end state)

`main` at `2902626`, **5 commits ahead of `origin/main`** (NOT pushed). Working tree clean except untracked `Future Projects/` (pre-existing, owner decision still pending).

## Do not re-raise without regression evidence

Everything marked SHIPPED in `FIX_SESSION_1.md` or logged in `COMPLETED_TASKS_2026-04-21.md` is closed. If you think something's broken, prove it from current code + live behavior — don't cite the audit file and assume.
