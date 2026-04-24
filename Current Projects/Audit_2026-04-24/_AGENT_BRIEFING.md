# Audit Agent Briefing — 2026-04-24

**Read this file first. It's your shared context.** Your Agent prompt gives the group-specific details; this file gives everything shared.

## Project

**Verity Post** at `/Users/veritypost/Desktop/verity-post`. Multi-surface news platform:
- `web/` — Next.js / TypeScript. Adult web + all API routes + admin console.
- `VerityPost/` — SwiftUI iOS for adults.
- `VerityPostKids/` — SwiftUI iOS for kids. COPPA-constrained, custom-JWT pair-code auth.
- Supabase backend, project `fyiwulqphgmoqullmrfn`.

**Product DNA:** the comment section is earned — every article has a 5-question quiz, pass 3/5 to unlock commenting.

**Mode:** web is in `NEXT_PUBLIC_SITE_MODE=coming_soon` — public pages gated behind a coming-soon wall. Backend + dev server are open for testing.

**Anchor SHA for this audit:** read `_ANCHOR_SHA.txt` in this same directory.

## Your role

You are an **INDEPENDENT AUDITOR**. Find bugs, drift, permission gaps, broken write-backs, missing error UX, stale caches, and unenforced gates.

**You DO NOT fix anything.** You do not edit code. You do not edit living documents (MASTER_TRIAGE, STATUS, CLAUDE.md, FIX_SESSION_1, README, PM_PUNCHLIST, session logs). You emit findings only.

## What you may do

- Read any file
- Run any read-only shell: `git`, `grep`, `rg`, `find`, `cat`, `head`, `tail`, `ls`, `wc`, `diff`, `jq`
- Start the dev server for UI verification: `cd web && npm run dev` (background it, curl it, then kill it)
- Use Supabase MCP **read-only**: `execute_sql` (SELECT only), `list_tables`, `list_migrations`, `list_extensions`, `get_logs`, `get_advisors`. No mutations.
- Read `Current Projects/PM_PUNCHLIST_2026-04-24.md` for context — but every finding you report must carry YOUR OWN first-hand evidence. Do not just echo the punchlist.

## What you may NOT do

- **Do NOT** run `apply_migration`, `deploy_edge_function`, or any MCP mutation
- **Do NOT** edit, create, or delete any code file
- **Do NOT** edit any living doc (listed above)
- **Do NOT** create files outside `/Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/`
- **Do NOT** commit anything to git
- **Do NOT** run `npm install`, `npm run build`, or anything that modifies node_modules or .next cache in a way that changes the tree

## Focus — common to all groups

1. **Per-role visibility.** Every role (`owner`, `admin`, `editor`, `moderator`, `expert`, `verity_family_xl`, `verity_family`, `verity_pro`, `verity`, `free`, `kid`, `anon`) — does the UI show what it should and hide what it shouldn't for this group's surfaces?
2. **Per-permission server enforcement.** Every mutation route must re-check permission via `requirePermission` or `hasPermission`, not trust the client. Find any that don't.
3. **DB write-back.** Every mutation — does it actually persist? Is it RLS-gated correctly? Does it emit audit_log when it should?
4. **Rate limits.** Every mutation — is `checkRateLimit` called? Does it fail closed in prod?
5. **Error UX.** Does the user get actionable feedback (toast, banner, redirect, empty state), or a silent failure? No silent fails.
6. **Cache freshness.** After role/plan changes, does `bump_user_perms_version` get called? Does the client invalidate its permissions cache?
7. **Sync between surfaces.** Does an action on web reflect on iOS after next load? Do permission changes propagate?

## Output format

Write findings to the filename given in your prompt. Structure:

```markdown
---
wave: [A|B]
group: [N] [GROUP NAME]
agent: [M]/3
anchor_sha: [SHA from _ANCHOR_SHA.txt]
dispatched: 2026-04-24
---

# Findings — [Group Name], Wave [A|B], Agent [M]

## CRITICAL

### F-[GROUP][M][nn] — [one-line title]
**File:line:** `path/to/file.ts:123`
**Evidence:**
```
[quote code, grep output, SQL result, or command output]
```
**Impact:** [what breaks, for whom, how user-visible]
**Reproduction:** [exact steps — or "code-reading only" if you couldn't repro]
**Suggested fix direction:** [one line, DO NOT IMPLEMENT]
**Confidence:** [HIGH / MEDIUM / LOW — LOW means flag as needs-tiebreaker]

## HIGH
[same format]

## MEDIUM
[same format]

## LOW
[same format]

## UNSURE
[items you can't confidently categorize — describe what info would resolve it]
```

**Every finding must cite file:line, SHA, or SQL output.** No speculation. If a finding rests on assumption, say so with "ASSUMPTION:" prefix.

**Target length:** under 1500 words. Prioritize CRITICAL findings with full evidence over comprehensive coverage of trivia.

**Effort:** up to 15 real minutes of focused work. Don't pad. Don't hedge. Don't narrate.
