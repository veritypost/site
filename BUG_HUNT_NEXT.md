# Bug Hunt — Cursor

Single-line state for the bug-hunt track. Updated automatically at session end. Independent of UI_UX_REVIEW_NEXT.md.

```
CURRENT_PHASE: fix-pass-pending
ANCHOR: Billing fix-pass complete 2026-05-03. 46 findings + 10 adversary gaps surfaced; 55 [fixed], 1 [deferred] (A2-008 orphaned-row reclaim — needs cron infra). Smoke PASS. Next: fix-pass for Moderation (32 findings).
LAST_UPDATED: 2026-05-03

PER_SURFACE_STATUS:
- Auth — sweep: done, fix-pass: COMPLETE (commit 8659182)
- Reading — sweep: done, fix-pass: COMPLETE (commit 1af4862)
- Billing — sweep: done (46 findings: 9C/18H/19M), fix-pass: COMPLETE (this session)
- Moderation — sweep: done (32 findings: 0C/10H/22M), fix-pass: not started
- Kid safety — sweep: done (46 findings: 7C/22H/17M), fix-pass: not started

DEFAULT_PROMPT (paste this every session):
  "Continue bug hunt per BUG_HUNT.md."

DIRECTED_PROMPTS (only if you want to skip auto-detect):
- Run sweep only: "Continue bug hunt per BUG_HUNT.md. Force step (a) — run the parallel sweep now even if cursor says otherwise."
- Run fix-pass for specific surface: "Continue bug hunt per BUG_HUNT.md. Force step (b) — fix-pass for <surface> (Auth | Reading | Billing | Moderation | Kid safety) per its bug doc."
- Run final smoke pass: "Continue bug hunt per BUG_HUNT.md. Force step (c) — final smoke."
```

**Phase values:** `sweep-pending` | `sweep-in-flight` | `fix-pass-pending` | `fix-pass-in-flight` | `final-smoke-pending` | `LAUNCH_READY`
