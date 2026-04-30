# Profile Audit — Program Rulebook

**Started:** (not yet started)
**Covers:** Web (`web/src/app/profile/`), main iOS (`ProfileView.swift`, `SettingsView.swift`), kids iOS (`ProfileView.swift` in VerityPostKids)
**Platform rule:** Every decision applies to all three platforms. A section that exists on web must have a stated position on iOS and kids iOS — even if that position is "not applicable" (named reason required).

---

## What this program is

A first-principles audit of the profile section across all three platforms. The goal is not to find bugs (that was `profile-bugfix/`) — it is to establish what the profile should be: what sections exist, what each role sees, what permissions gate what, what is redundant or missing, and what the right structure is going forward.

The profile section has grown organically. It currently has 21 sections, 8 settings cards, and 8 sub-routes on web alone. Not all of them are needed. Not all of them correctly reflect role boundaries. This program produces a locked, owner-approved design that becomes the ground truth for profile going forward.

**The output is decisions, then implementation.** The first half of the program is research and Q&A. The second half implements the locked design. Nothing is implemented before decisions are locked — and no decision is locked before research agents have done a full sweep of the current state, the options, and the tradeoffs.

---

## Roles in scope

Every section must be audited against all applicable roles. A section with an unclear or missing role boundary is a finding.

| Role | Description |
|---|---|
| `anon` | Not signed in — can reach `/u/[username]` public profile only |
| `free` | Signed-in, free tier |
| `pro` | Signed-in, paid tier |
| `expert` | Signed-in, verified expert (may be free or pro) |
| `admin` | Staff — access to admin surfaces; profile is their own profile too |
| `parent` | Adult user with one or more linked kid profiles |
| `kid` | Kid account (kids iOS app only; web profile is redirect-only) |

For each section: which roles see it? What can each role do within it? Are the permission gates in the code correct?

---

## How phases work

This program uses **phases**, not slices. Each phase has a defined output — no phase ends without its output written to the phase doc.

| Phase | Name | Output |
|---|---|---|
| 0 | Founding | This README, INDEX, SESSION_LOG, system map |
| 1 | Inventory | Complete feature table: every section/card/route on all 3 platforms, current state, kill-switch status |
| 2 | Role matrix | Table: role × section × (sees / can do / permission gate / correct?) across all 3 platforms |
| 3 | Research | For each gap/redundancy/contradiction — agents investigate options + tradeoffs; findings doc per open question |
| 4 | Q&A | Owner decisions locked one-at-a-time; no bundling; all decisions recorded in phase doc |
| 5 | Implementation plan | Locked change list with file:line targets; adversarial review before any code |
| 6 | Web implementation | Code changes for web; TypeScript clean; pushed |
| 7 | iOS implementation | Code changes for iOS + kids iOS; pushed |

**Phases 1–4 are research and decision only. No code changes until Phase 5 is locked.**

---

## The research-before-Q&A rule

This is the most important rule in this program.

Before any question goes to the owner for a decision, research agents must have already investigated:
1. What the current code actually does (not what it's supposed to do)
2. What the options are
3. What the tradeoffs of each option are
4. Whether there are constraints that eliminate any option (DB schema, existing permissions, platform limits)

A Q&A question that reaches the owner without this research is wasted — the owner has to make a decision without knowing what they're choosing between. The research phase exists to make every Q&A question the best possible version of itself.

**Format for each Q&A question:**
- One sentence of context (what the current state is)
- What's at stake (what breaks or improves with each option)
- Your recommendation and why
- The question itself

Never bundle two questions into one. If a question isn't ready because research is incomplete, hold it.

---

## Agent discipline

Every phase uses parallel Explore agents. The number and focus varies:

**Phase 1 (Inventory):** 3 agents in parallel
- Agent A: web profile sections (`_sections/` + `_components/` + sub-routes)
- Agent B: web profile settings cards + API routes
- Agent C: iOS `ProfileView.swift` + `SettingsView.swift` + kids `ProfileView.swift`

**Phase 2 (Role matrix):** 4 agents in parallel
- Agent A: permission gates on web profile sections (traces `PermsBoundary`, role checks, kill switches)
- Agent B: permission gates on web settings
- Agent C: permission gates on iOS profile + settings
- Agent D: DB-level permissions — `my_permission_keys` RPC, permission sets, what keys actually gate what

**Phase 3 (Research):** 1–2 agents per open question, running in parallel where questions are independent

**Phase 4 (Q&A):** No agents. Owner + assistant only. One question at a time.

**Phase 5–7 (Implementation):** Full 6-agent ship pattern per memory rule.

---

## What a finding looks like

Each finding in the inventory or role matrix gets a status:

- **gap** — something that should exist but doesn't
- **redundant** — two things that do the same job; one should win
- **wrong-gate** — a section that's visible to the wrong roles, or gated incorrectly
- **should-not-exist** — a section or route with no clear purpose or owner
- **needs-design** — exists but the design is incomplete or inconsistent across platforms
- **correct** — verified correct; no action needed

Findings of type `should-not-exist` and `wrong-gate` go to Q&A. Findings of type `redundant` and `needs-design` get a research pass first. Findings of type `gap` require a research pass to scope the work before Q&A.

---

## Platform consistency rule

Per project memory: every change must cover web, iOS, and kids iOS. In this program that means:
- Every section decision must state the equivalent on all three platforms
- A section that is "removed from web" must also state what happens on iOS
- "Not applicable on kids iOS" is valid — but must be stated, not silently omitted
- Sections that exist on iOS but not web (or vice versa) are automatically a finding

---

## Files in this program

```
Conversations/profile-audit/
├── README.md               ← this file (rules)
├── INDEX.md                ← live dashboard (phase statuses, open questions)
├── SESSION_LOG.md          ← append-only chronological log
├── 00-system-map.md        ← full profile architecture reference
└── phases/
    ├── 01-inventory.md         (written in phase 1)
    ├── 02-role-matrix.md       (written in phase 2)
    ├── 03-research.md          (written in phase 3)
    ├── 04-qa-decisions.md      (written in phase 4)
    └── 05-implementation-plan.md (written in phase 5)
```
