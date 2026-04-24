# Reconciler Agent Briefing — Phase 4

You are a **reconciler**. Your job: read the 6 findings files for one audit group (3 Wave A + 3 Wave B), and emit a consolidated verdict.

## Input files

For your assigned group N (name NAME):
- `WaveA_GroupN_NAME_Agent1.md`
- `WaveA_GroupN_NAME_Agent2.md`
- `WaveA_GroupN_NAME_Agent3.md`
- `WaveB_GroupN_NAME_Agent1.md`
- `WaveB_GroupN_NAME_Agent2.md`
- `WaveB_GroupN_NAME_Agent3.md`

All in `/Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/`.

## Rules

- Read all 6 files. No skipping.
- Read-only. Do not edit or create anything outside `/Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/`.
- Do not speculate. Every verdict must cite which agents surfaced the finding.
- Do not de-duplicate aggressively — "same symptom, different file:line" counts as two separate findings; "same file:line, different wording" is one.

## Output format

Write to `/Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Recon_GroupN_NAME.md`:

```markdown
---
group: [N] [NAME]
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — [Group NAME]

## AGREED findings (≥2 agents, both waves ideally)
High confidence. Ready for master list.

### R-[N]-AGR-01 — [title]
**Severity:** [CRITICAL / HIGH / MEDIUM / LOW]
**File:line:** `path/file.ts:123`
**Surfaced by:** WaveA Agent1, WaveA Agent3, WaveB Agent2 (3/6)
**Consensus description:** [merged from contributing agents]
**Suggested disposition:** [AUTONOMOUS-FIXABLE / OWNER-ACTION / UI-NEEDS-INPUT]

## UNIQUE-A findings (Wave A only, needs tiebreaker)
### R-[N]-UA-01 — [title]
**Severity:** ...
**File:line:** ...
**Surfaced by:** WaveA Agent2 only
**Description:** ...
**Tiebreaker question:** [what a fresh agent must verify]

## UNIQUE-B findings (Wave B only, needs tiebreaker)
### R-[N]-UB-01 — [title]
... (same format)

## STALE / CONTRADICTED findings
Items one wave flagged but another wave explicitly disputed with evidence.

### R-[N]-STALE-01 — [title]
**Claimed by:** WaveA Agent1
**Disputed by:** WaveB Agent2 (quote the disputing evidence)
**Your verdict:** [STALE / NEEDS-TIEBREAKER]

## Summary counts
- AGREED CRITICAL: X
- AGREED HIGH: X
- AGREED MEDIUM/LOW: X
- UNIQUE-A: X
- UNIQUE-B: X
- STALE: X

Total findings reconciled: X
```

## Disposition labels

For AGREED findings, classify:
- **AUTONOMOUS-FIXABLE:** Clear code/DB fix with file:line evidence + unambiguous correct direction. Claude can execute without owner input.
- **OWNER-ACTION:** Requires external dashboard (Vercel, Stripe, Apple Developer, Supabase console), policy decision, or design/product judgment.
- **UI-NEEDS-INPUT:** UI or UX change where the code could support multiple valid approaches; needs owner design call.

Keep the reconciliation file under 2500 words. Focus on the CRITICAL and HIGH findings — MEDIUM/LOW can be summarized in bullets.

No fixing. No editing other files. Read the 6 inputs, write your one reconciliation output, done.
