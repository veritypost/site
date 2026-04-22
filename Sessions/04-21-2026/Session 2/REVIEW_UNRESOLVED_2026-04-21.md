# Multi-Agent Review — Unresolved Items (2026-04-21)

Per owner directive: items where 4 fresh independent agents deadlock (2/2) are logged here and skipped for owner adjudication rather than re-forced to a verdict.

## M26 — CLAUDE.md inline T-### references (T-017, T-033-T-038, T-042, T-044, T-060, T-101)

**Claim:** CLAUDE.md contains ~13 inline T-### task IDs that reference a retired `TASKS.md` tracker. `Current Projects/FIX_SESSION_1.md` uses a `#1..#N` scheme, not T-IDs.

**Agent positions:**
- **A (remap or remove):** 2 votes. CLAUDE.md is live onboarding; dead T-IDs mislead agents trying to resolve them; archaeology belongs in git log / session logs, not the constitution.
- **B (leave as-is):** 2 votes. T-IDs are stable grep handles across commits + session logs; rewriting invents new IDs that point nowhere; cross-session traceability has real value.

**Disposition:** Owner decision. This is a taste call between doc hygiene and historical traceability; both positions are defensible. No technical right answer.

**If owner picks A:** sweep all `T-\d+` refs in `Reference/CLAUDE.md`; remap known ones to FIX_SESSION_1 `#N` item numbers (T-033-T-038 → Apple block items in FIX_SESSION_1) or drop with a pointer "see FIX_SESSION_1.md Apple items."

**If owner picks B:** add a one-line note at the top of CLAUDE.md: "Inline T-## refs are historical; resolved status in git log + FIX_SESSION_1 SHIPPED blocks."

## M37 — F7 PM prompt §6 settings-row mapping clarification

**Claim:** F7 PM prompt §6 Phase 1 lists 4 settings rows — two with inline owner-decision citations (decisions 4, 5) and two with hardcoded defaults (`ai.enabled=true`, `pipeline.cron_lock=false`). Should the prompt explicitly note which decisions drive settings values vs. which shape code paths?

**Agent positions:**
- **A (add clarifier):** 2 votes. Mixed citation patterns create ambiguity; one-line clarifier preempts the question; aligns with "make state artifacts unambiguous" memory rule.
- **B (no change):** 2 votes. Inline parentheticals already self-document the mapping; extra prose is noise in an already-long prompt.

**Disposition:** Owner decision. Taste call on doc verbosity vs. explicit-is-better-than-implicit.

## M39 — F7 PM prompt §16 verbatim quote-back requirement

**Claim:** §16 asks the new PM to "quote the four-agent workflow back to them verbatim (not paraphrased)." §3a is ~400 words across 7 items. Owner "hates ceremony" per §1.

**Agent positions:**
- **A (keep verbatim):** 2 votes. Verbatim protects load-bearing invariants (4/4 threshold, sequencing, triggers) from paraphrase drift. One quoted block isn't the ceremony-type the owner objects to.
- **B (soften to summary):** 2 votes. Verbatim is copy-paste theater that proves nothing about comprehension; short summary demonstrates understanding without burning 400 tokens up front.

**Disposition:** Owner decision. Trade-off between invariant-preservation and anti-ceremony. No technical right answer.

## M26 — RESOLVED on retry (sweep T-IDs)

4/4 fresh agents voted A on retry. Consensus: live-doc T-### refs pointing at retired TASKS.md are drift; sweep or remap to FIX_SESSION_1.md `#N` item references. Applied this session.

## M37 — RESOLVED on retry (add clarifier)

4/4 fresh agents voted A on retry. Consensus: mixed per-decision + hardcoded defaults without a mapping invites drift; one-sentence clarifier about decisions 4+5 driving settings values added to F7 PM prompt §6 Phase 1.

## M39 — RESOLVED on retry (keep verbatim, majority)

3/1 fresh agents voted A on retry. Majority: verbatim quote-back protects load-bearing invariants (4/4 unanimous gate, fresh-agents-on-divergence) from paraphrase drift across many sessions. Dissent (1): verbatim is copy-paste ceremony. Adopted A with dissent noted. No change to §16.

## M46 — Stale session-state memory pattern

**Claim:** `project_session_state_2026-04-20.md` in user-memory is stale (retired TASKS.md refs, superseded commits). MEMORY.md indexes it as authoritative.

**Agent positions:**
- **A (refresh pattern):** 2 votes. Daily session-state entries are the primary cross-session continuity mechanism; supersede the stale entry + write fresh 2026-04-21.
- **B (delete + abandon pattern):** 2 votes. Session logs on disk (`Sessions/<date>/Session <N>/SESSION_LOG_*.md`) are the canonical snapshots; mirroring to user-memory creates a second drift source. MEMORY.md should hold durable rules, not changelogs.

**Disposition:** Owner decision. Design call on whether user-memory holds session snapshots or only durable rules. **Deadlocked twice (2/2 on first 4-agent round, 2/2 again on fresh retry)** — this is a genuine taste/design split, not a correctness question. Owner adjudicates.
