# 2026-04-18 — Security Rounds 2–7

Incremental security hardening prep docs that preceded the 2026-04-19 capstone sprint (Rounds A–I in `../2026-04-19-prelaunch-sprint/`). Each round was a focused audit-and-fix pass on a specific attack surface.

- **Round 2** — `_round2_prep.md`
- **Round 3** — `_round3_prep.md`
- **Round 4** — `_round4_prep.md`, `_round4_prep_HYGIENE.md`, `_round4_prep_SECURITY.md` (Track X extended the admin lock to DS primitives)
- **Round 5** — three items:
  - Item 1 (`_round5_item1_{audit,fix_plan}.md`)
  - Item 1B (`_round5_item1B_{audit,fix_plan}.md`)
  - Item 2 (`_round5_item2_{audit,fix_plan}.md`)
- **Round 6** — three parallel tracks:
  - `_round6_security_plan.md` — admin RPC lockdown (14 SECURITY DEFINER RPCs)
  - `_round6_ios_data_plan.md` — iOS column-name drift fixes
  - `_round6_ios_gates_plan.md` — paid-tier bypass close (bearer fallback + DM/follow API routing)
- **Round 7** — two tracks:
  - `_round7_bearer_bypass_plan.md` — Track Y
  - `_round7_startconv_support_tx_plan.md` — Track Z (start_conversation + support_ticket atomic RPCs)

**Status:** DONE. All landed pre-capstone; outcomes are summarized in `00-Where-We-Stand/REFERENCE.md` §12.
