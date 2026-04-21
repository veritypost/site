# 2026-04-19 — Pre-launch Hardening Sprint

Nine-round sprint (A–I) that took the project from "three reviewers refuse to ship" to capstone-verified ship-ready in one day.

**Inputs:**
- `_prelaunch_reviewer_{1,2,3}.md` — three independent reviewer passes (deploy / flow / security), each filed NO
- `_prelaunch_master_issues.md` — 87 raw issues deduped to 59 (6 Critical, 22 High, 20 Medium, 11 Low)
- `_prelaunch_attack_plan.md` — organized the 59 into Rounds A–I

**Execution:**
- `round_a_*` — RLS lockdown (migration `092`), 15 caller swaps
- `round_b_*` — RPC actor-spoof sweep (migration `093`)
- `round_c_plan.md` — money-path UX (/billing shim, DM regwall, quiz dead-ends)
- `round_d_plan.md` — public surface (/status removed, /contact, Stripe URLs, sitemap)
- `round_e_plan.md` — auth/signup integrity (migration `094`)
- `round_f_plan.md` — CSP nonce, CORS, cron header, Sentry
- `round_g_plan.md` + `round_g_owner_action.md` — storage bucket + HIBP toggle clickpath
- `round_h_migration.sql` — search_path hygiene on 13 functions
- `round_i_plan.md` — UX/copy polish

**Output:**
- `_prelaunch_capstone_report.md` — **CONDITIONAL YES** verdict, all 6 Criticals + 22 Highs verified resolved against live DB + dev server

**`_claims/`** — track-claim tokens from parallel execution (E, F, G, H, K, L).

**Status:** DONE. Owner-side items remaining (HIBP toggle, Stripe rotation, Sentry DSN, editorial articles) tracked in `05-Working/OWNER_TO_DO.md` and `05-Working/ROTATE_SECRETS.md`.
