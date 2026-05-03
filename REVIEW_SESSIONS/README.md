# Review Cleanup — Session Plan

Six sequential sessions to clean up the 156 findings in `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md`. Run them in order, not in parallel — each session changes state the next session verifies against.

## How the owner uses this

Open a **fresh Claude conversation** and type one of these to start the session:

- `start session 1` — DB / RLS hardening (10 P0s + 8 P1s)
- `start session 2` — Auth flow fixes (2 P0s + auth P1s)
- `start session 3` — Admin RBAC + chrome (2 P0s + admin P1s)
- `start session 4` — Billing + iOS bridge (2 P0s + billing P1s)
- `start session 5` — Pipeline cost-cap + polish (1 P0 + remaining P1s + UX)
- `start session 6` — End-to-end verification + CLAUDE.md cleanup

Each session doc is self-contained — the new conversation reads its session doc, the relevant PM section in REVIEW_REPORT.md, and starts work.

## What every session does (orchestration pattern)

```
owner > architect (you in the new conversation) > PM agents > 3-5 specialized subagents
```

Same pattern as the review pass. The new conversation acts as the architect.

## Verification gates inside every session

Mandatory:
1. **Pre-impl finding-verifier** — re-confirm each finding still exists on current disk before opening a fix slice. Drop refuted findings.
2. **Build-verifier** post-impl — type-check, lint, sentinel grep, file-existence checks.
3. **Independent reviewer** post-impl — fresh agent reads the diff, confirms each finding is closed.

Additional for elevated-care (sessions 1, 3, 4):
4. **Adversary pass** — paranoid review of what implementers introduced *while fixing*.

## Done definition for each session

- Every in-scope P0/P1 from the session is either fixed or marked refuted with evidence.
- All verification gates pass.
- A status block is appended to the session's doc with: PMs used, findings closed, findings refuted, follow-ups discovered.
- For sessions 1-5: the next session is **not** auto-started — owner runs `start session N+1` in a fresh conversation.

## Source of truth for findings

`/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (2,575 lines, top has architect synthesis with the deduped P0 list and recommended fix order).

Sessions reference findings by **PM section + finding title**, not by line number, since the report file may grow as sessions append status blocks.
