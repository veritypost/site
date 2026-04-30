# Profile Audit — Index

**Last updated:** 2026-04-30
**Phase:** 7 — **complete** (all iOS changes shipped; program closed)
**Next session should pick up:** Nothing outstanding. Q8B (FeedPreferencesCard) remains deferred until Q8A production verification. Q10/Q11 iOS confirmed N/A (reader-only app).

---

## Phase status

| # | Phase | Status | Last touched | Doc |
|---|---|---|---|---|
| 0 | Founding | **complete** | — | `README.md`, `00-system-map.md` |
| 1 | Inventory | **complete** | 2026-04-30 | `phases/01-inventory.md` |
| 2 | Role matrix | **complete** | 2026-04-30 | `phases/02-role-matrix.md` |
| 3 | Research | **complete** | 2026-04-30 | `phases/03-research.md` |
| 4 | Q&A & decisions | **complete** (Q1–Q12 locked) | 2026-04-30 | `phases/04-qa-decisions.md` |
| 5 | Implementation plan | **complete** | 2026-04-30 | `phases/05-implementation-plan.md` |
| 6 | Web implementation | **complete** | 2026-04-30 | `phases/05-implementation-plan.md` |
| 7 | iOS + kids implementation | **complete** | 2026-04-30 | `SESSION_LOG.md` Session 7 |

---

## Open questions

*(Populated during Phase 3 research and Phase 4 Q&A. Each question gets a status: open / answered / deferred.)*

These are pre-research — not yet ready for Q&A. Phase 3 will investigate options + tradeoffs for each before they go to the owner.

| # | Question | Status | Finding ID(s) |
|---|---|---|---|
| OQ1 | Should web get a streak heatmap visualization? Where does it live? | **researched** — recommendation: add to web (zero backend work; data exists) | G1 |
| OQ2 | Should iOS get a full ExpertQueueSection or remain routing-only? | **RESOLVED** — iOS already has `ExpertQueueView.swift` with full parity; G2 finding was a Phase 1 miss (separate file). Back-channel tab is placeholder on both platforms (intentional). | G2 |
| OQ3 | Should expert credentials/areas/vacation management exist on iOS? | **researched** — recommendation: build ExpertProfileView on iOS (no new APIs needed) | G3 |
| OQ4 | Should web get a feed preferences section, or is iOS feed-prefs the only surface? | **researched** — recommendation: add to web (zero backend work; data structure exists) | G4 |
| OQ5 | Canonical home for blocked accounts: profile rail (web) or settings (iOS)? | **researched** — recommendation: move web to Settings | G5, R3 |
| OQ6 | `profile.card_share` (web) vs `profile.card.share_link` (iOS) — two different keys for same feature. Canonicalize. | **researched** — bug confirmed (5 role types broken on iOS); recommendation: canonicalize on `profile.card_share` | WG3 |
| OQ7 | Sessions (active/revocable on web) vs. Login Activity (audit log on iOS) — genuinely different features. Add audit log to web? | **researched** — recommendation: add audit log to web | WG2, F4 |
| OQ8 | Is `/profile/contact` intentionally open to anon? | **RESOLVED** — WG4 closed. API enforces auth (requireAuth); UI open is intentional for support access. No action. | WG4 |
| OQ9 | Are activity/achievement previews on iOS Overview intentionally free (teaser) or oversight? | **researched** — oversight; depends on OQ-NEW-1 resolution | ND3, ND4 |
| OQ10 | Dead notification per-type toggles on iOS: remove or plan to revive? | **RESOLVED** — ND5 closed. Toggles already removed (commit 24f655e). Web + iOS both channel-level only for first pass. No action. | ND5 |
| OQ-NEW-1 | DB reports `profile.achievements`, `profile.activity`, `profile.categories`, `bookmarks.list.view` as in the `free` permission set — which all signed-in users hold — yet the UI locks these. `messages.inbox.view` is correctly pro-only. | **RESOLVED (factual)** — DB is correct; UI is wrong on 4 keys. Phase 4 decision needed: unlock for free users or move keys to pro-only. | PF-1 contradiction |
| OQ-NEW-2 | iOS gates 5 account-settings rows; web renders unconditionally. Should web add gates or iOS remove them? | **researched** — recommendation: remove iOS gates (account mgmt should never be tier-gated) | PF-1 |

---

## Locked decisions

*(Populated during Phase 4. Once locked, never re-opened.)*

| Q | Decision |
|---|---|
| Q1 / OQ-NEW-1 | Achievements, categories, bookmarks = free. Activity = 30 days free / full history pro. Design: show data, never gamify. |
| Q2 / OQ-NEW-2 | Remove iOS account-settings permission gates (dead code, legal obligation). |
| Q3 / OQ5 | Move web blocked accounts from profile rail → Settings/Privacy. |
| Q4 / OQ7 | Add read-only login audit log to web (RPC exists, zero backend). |
| Q5 / OQ9 | Closed/mooted — Q1 unlocks activity + achievements for free, oversight disappears. |
| Q6 / OQ6/WG3 | Canonicalize card share on `profile.card_share` — iOS one-string fix, bug resolved. |
| Q7 / OQ1 | Add 30-day reading heatmap to web. Ambient data display, zero pressure copy. |
| Q8 / OQ4 | Add FeedPreferencesCard to web. Conditional: verify feed renderer reads flags first. |
| Q9 / OQ3 | Build ExpertProfileView on iOS (vacation, credentials, verified areas, status). |
| Q10 / SUB-1 | Fix story editor subcategory save — wire subcategory_id into article save payload. |
| Q11 / SUB-2 | Add subcategory filter bar to `/category/[slug]` browse pages. |
| Q12 / SUB-3 | Rebuild CategoriesSection as hierarchical analytics dashboard using `get_user_category_metrics` RPC. |

---

## Known surface facts (pre-investigation)

These are verified facts about the current state, seeded from prior programs. Do not re-investigate.

**Web — what exists:**
- 21 profile sections under `web/src/app/profile/_sections/`
- 8 settings cards under `web/src/app/profile/settings/_cards/`
- Sub-routes: `/profile`, `/profile/settings`, `/profile/settings/billing`, `/profile/settings/expert`, `/profile/family`, `/profile/kids`, `/profile/kids/[id]`, `/profile/[id]`, `/profile/card`, `/profile/category/[id]`, `/profile/contact`
- 1 API route: `/api/profile/trial-banner-dismiss`

**iOS — what exists:**
- `ProfileView.swift` — single file containing the full profile surface
- `SettingsView.swift` + `SettingsService.swift`
- `AlertsView.swift`

**Kids iOS — what exists:**
- `ProfileView.swift` — kids profile (achievements, streak, reading record)

**Bug history:** `Conversations/profile-bugfix/` fixed 15 bugs across 3 sessions. Known-fixed issues there should not be re-opened here — this program is about design and role correctness, not bug fixing.

---

## Cross-platform consistency gaps (pre-investigation)

These are already-known gaps between platforms. Investigation will surface more.

| Surface | Web | iOS | Kids iOS |
|---|---|---|---|
| Sessions management | `SessionsSection.tsx` | Unknown | Not applicable |
| MFA settings | `MFACard.tsx` | Unknown | Not applicable |
| Expert apply / profile | `ExpertApplyForm.tsx`, `ExpertProfileSection.tsx`, `ExpertQueueSection.tsx` | Unknown | Not applicable |
| Family management | `/profile/family/page.tsx` | `FamilyViews.swift` | Not applicable |
| Kids profiles | `/profile/kids/` | `FamilyViews.swift` | Own profile only |
| Data export / deletion | `DataSection.tsx`, `DataCard.tsx` | Unknown | Parental gate required |
| Blocked users | `BlockedSection.tsx` | `BlockService.swift` (separate) | Not applicable |
| Milestones / achievements | `MilestonesSection.tsx` | Unknown | `ProfileView.swift` (kids) |

---

## Deferred items

| Item | Reason | Condition to un-defer |
|---|---|---|
| Q8B — FeedPreferencesCard (web) | Requires Q8A (showBreaking flag) verified in production first | Owner confirms Q8A working correctly in prod |
| Q10 iOS | N/A — iOS is a reader-only app; no StoryEditor equivalent exists | Not applicable |
| Q11 iOS | N/A — iOS category browse has no subcategory filter (intentionally stripped per HomeView comment) | Not applicable |
| Q12 iOS — CategoriesSection rebuild | Out of scope for Session 7; requires Q10 web in production first | Future session |
