# AuditV2/

Working folder for the Verity Post audit done 2026-04-25. Synthesis lives at the repo root in `AuditV2.md`.

## Layout

```
AuditV2/
├── 00-README.md                  this file
├── GAPS.md                       what AuditV2 didn't handle (definitely-missing + questionable)
├── wave1/                        19 zone inventories (full file reads)
│   ├── Z01_reference.md
│   ├── Z02_current_projects_root.md
│   ├── Z03_audit_topline.md
│   ├── Z04_audit_waves_AB.md
│   ├── Z05_audit_round2.md
│   ├── Z06_future_projects.md
│   ├── Z07_sessions.md
│   ├── Z08_archived_part1.md
│   ├── Z09_archived_part2.md
│   ├── Z10_misc_docs.md
│   ├── Z11_schema.md
│   ├── Z12_web_lib.md
│   ├── Z13_web_pages.md
│   ├── Z14_web_admin.md
│   ├── Z15_web_api.md
│   ├── Z16_web_components.md
│   ├── Z17_ios_adult.md
│   ├── Z18_ios_kids.md
│   └── Z19_scripts_supabase.md
├── wave2/                        11 cross-reference threads
│   ├── W2-01_permissions_integrity.md
│   ├── W2-02_f7_pipeline.md
│   ├── W2-03_kids_consistency.md
│   ├── W2-04_apple_status.md
│   ├── W2-05_reader_comments_quiz.md
│   ├── W2-06_billing_cross_provider.md
│   ├── W2-07_master_triage_accuracy.md
│   ├── W2-08_doc_drift.md
│   ├── W2-09_hardcoded_and_drift.md
│   ├── W2-10_schema_api_coherence.md
│   └── W2-11_audit_internals.md
└── wave3/
    └── W3_verification_summary.md  spot-check verifications + remaining unresolved
```

## Methodology recap

- **Wave 1:** 19 parallel reading agents (`general-purpose` subagents). Each read every file in its zone fully, wrote inventory to disk. ~7,000 lines.
- **Wave 2:** 11 cross-reference threads, each resolves one cross-cutting topic (permissions, F7, kids, Apple, reader/comments, billing, MASTER_TRIAGE, doc drift, hardcoded/JS-TS, schema/API, audit internals). Org budget killed the parallel agents partway; threads completed in main thread using Wave 1 inventories + Supabase MCP + grep.
- **Wave 3:** targeted spot-checks via DB queries + grep + direct file reads. Same eyes as Wave 2 (independence compromised — see GAPS M1).

## Tiebreaker

Every disputed claim was resolved by **code first, DB second, most-recent doc third.** Doc-only claims that conflicted with code were marked stale.

## Status

- Wave 1: complete
- Wave 2: complete (with caveat — agent budget caused mid-wave switch to in-thread)
- Wave 3: spot-checks only; full sweep deferred (see GAPS M2-M30)
- Synthesis: `AuditV2.md` at repo root

## What's NOT in AuditV2

See `GAPS.md` in this folder. 30 definitely-missing items (M1-M30) + 20 questionable findings (Q1-Q20) + 6 owner-decision items.
