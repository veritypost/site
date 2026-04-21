# 2026-04-18 — Permission System Phases 1 + 2

Canonical build-out of the new permission-driven system.

- **Phase 0** — matrix cleanup (916 permissions + 10 sets finalized in `permissions.xlsx`)
- **Phase 1** — import xlsx → Supabase (`scripts/import-permissions.js`; backup at `test-data/backup-2026-04-18/`)
- **Phase 2** — user-centric admin console (`/admin/users/[id]/permissions`) + `compute_effective_perms` RPC + POST endpoint

Commits: `0416e52` (phase 1) + `d09e3ee` (phase 2).

**`MIGRATION_STATUS.md`** is the step-by-step log of Phases 1 + 2. Superseded by `00-Where-We-Stand/REFERENCE.md` as the live status doc — prefer REFERENCE.md when they disagree.

**Status:** DONE.
