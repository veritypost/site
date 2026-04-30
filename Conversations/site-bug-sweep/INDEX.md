# Site Bug-Sweep — Index

**Last updated:** 2026-04-30 (session 2 — slice 01 shipped)
**Phase:** 1 — slice 01 shipped
**Next session should pick up:** Slice 02 — Navigation & discovery

---

## Slice status

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 01 | Auth & account gates | **shipped** | 2026-04-30 | `slices/01-auth-gates.md` |
| 02 | Navigation & discovery | **not-started** | — | — |
| 03 | Article reading | **not-started** | — | — |
| 04 | Reader engagement & social | **not-started** | — | — |
| 05 | Messaging | **not-started** | — | — |
| 06 | Billing & subscription | **not-started** | — | — |
| 07 | Admin surfaces | **not-started** | — | — |
| 08 | API routes cross-cut | **not-started** | — | — |

**Profile section:** covered by `Conversations/profile-bugfix/` — 15 bugs shipped across 3 sessions (2026-04-30). Do not re-open here. Cross-surface findings from that program are noted in the "Cross-surface findings" section below.

**Default ordering** is 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08. Owner can redirect at any time.

---

## Foundation status

| Doc | Status |
|---|---|
| `README.md` | ✓ written 2026-04-30 |
| `00-system-map.md` | ✓ written 2026-04-30 |
| `SESSION_LOG.md` | ✓ written 2026-04-30 (session 0 entry) |

---

## Cross-surface findings

Findings that surfaced in one slice investigation but touch a different slice. Each one is deferred to the slice that should decide it — listed here to stay visible at program level.

1. **`/community-guidelines` route does not exist** (from profile-bugfix P-13). `AccountStateBanner` dead link was fixed; no other callers found in that sweep. Any surface that links to `/community-guidelines` will 404. Track here until a full-repo grep is run.

2. ~~**`auth.js:346` calls `compute_effective_perms` (potentially dead RPC)**~~ — **fixed in `d2da5a0`** (slice 01, issue 01-00). Renamed to `my_permission_keys`; response normalized with `granted: true`. Cross-cutting risk to slices 03–08 is resolved.

---

## Known FK mismatches

FK hints that were wrong and have already been fixed. Carried here so future agents don't re-investigate them as open issues.

| Old (wrong) hint | Correct hint | Fixed in |
|---|---|---|
| `blocked_users_blocked_id_fkey` | `fk_blocked_users_blocked_id` | profile-bugfix session 3 (`95abb13`) |
| `follows_follower_id_fkey` | `fk_follows_follower_id` | profile-bugfix session 3 (`95abb13`) |

---

## Open owner-actions

None at this time.

---

## Deferred items (named, intentional)

None yet.
