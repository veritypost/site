# iOS Bug-Sweep — Index

**Last updated:** (not yet started)
**Phase:** 0 — program founded; no slice started
**Next session should pick up:** Session 0 — founding pass (read README, system map, verify slice design, write SESSION_LOG entry 0). Then slice 01 — Auth & session.

---

## Slice status

### Main iOS app (`VerityPost/`)

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 01 | Auth & session | **not-started** | — | — |
| 02 | Navigation shell & home feed | **not-started** | — | — |
| 03 | Article reading & event tracking | **not-started** | — | — |
| 04 | Discovery (Find, Leaderboard, Following) | **not-started** | — | — |
| 05 | Social & engagement | **not-started** | — | — |
| 06 | Messaging & realtime | **not-started** | — | — |
| 07 | Profile, settings & push | **not-started** | — | — |
| 08 | Billing & subscription | **not-started** | — | — |
| 09 | Family & kids bridge | **not-started** | — | — |

### Kids iOS app (`VerityPostKids/`)

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 10 | Kids auth & pairing | **not-started** | — | — |
| 11 | Kids home & article reading | **not-started** | — | — |
| 12 | Kids quiz & gamification | **not-started** | — | — |
| 13 | Kids profile & parental controls | **not-started** | — | — |

**Default ordering:** 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13. Owner can redirect at any time.

---

## Foundation status

| Doc | Status |
|---|---|
| `README.md` | ✓ written |
| `00-system-map.md` | ✓ written |
| `SESSION_LOG.md` | ✓ written (founding entry) |

---

## Cross-surface findings

Findings that surfaced in one slice but touch another. Deferred here to stay visible.

*(None yet — populated as slice investigations run.)*

---

## Known fixed issues (do not re-investigate)

Issues that were already addressed in earlier programs and are confirmed fixed in the current codebase.

| Issue | Fix | Source |
|---|---|---|
| `StoryDetailView` realtime subscription used `users!user_id` join (403 for non-admins) | Replaced with `public_profiles_v` | article-lifecycle session 9 |
| `KidReaderView` stale content on background→foreground | Re-fetches on `scenePhase == .active` at lines 113–116 | article-lifecycle session 9 (confirmed already fixed) |

---

## Open owner-actions

None at this time.

---

## Deferred items (named, intentional)

None yet.
