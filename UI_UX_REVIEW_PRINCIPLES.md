# UI/UX Review — Principles (rulebook)

Non-negotiables. Every review session applies these silently. If code matches → pass. If not → finding.

This doc grows during the seeding session and on rare cases when a new standing rule lands. Most sessions only read it.

Numbering is stable. Findings cite as `PRINCIPLE §<n>`.

---

## §1 — Visual system

*To be filled in seeding session. Topics: type scale, spacing scale, color tokens, dark-mode parity rule, brand voice for visuals.*

- §1.1 Dark mode parity is required on every user-facing surface. Not optional.
- §1.2 No color-per-tier. Tier is a label, not a visual identity. Reject any rainbow / muted ramp / gradient that encodes rank.
- §1.3 *(seed: type scale)*
- §1.4 *(seed: spacing scale)*
- §1.5 *(seed: contrast minimum — WCAG AA assumed unless owner overrides)*

## §2 — Interaction

- §2.1 Hit targets ≥ 44pt on iOS, ≥ 44px on web touch surfaces.
- §2.2 No keyboard shortcuts / hotkeys / command palettes in admin. Click-driven only.
- §2.3 Every CTA must wire to a real action. No dead buttons, no "coming soon" links.
- §2.4 *(seed: focus order rules)*
- §2.5 *(seed: error toast vs inline error rule)*

## §3 — States (anon / loading / empty / error / success / auth-tier)

Every screen designs all relevant states. Missing state = finding.

- §3.1 Loading states are designed, not assumed.
- §3.2 Empty states have a CTA when an action exists, copy when one doesn't.
- §3.3 Errors have a recovery path (retry, back, contact).
- §3.4 *(seed: anon-vs-auth gating pattern — when to gate at middleware vs render an inline CTA)*
- §3.5 *(seed: paid-tier upsell pattern)*
- §3.6 Queue / role-heavy surfaces require full **role × state × permission** matrix coverage. Any surface where items move through a workflow (pending / in-progress / resolved / dismissed / archived) AND multiple roles can act on the same item (viewer, commenter, expert, moderator, admin, Owner Mode holder) must have every cell of that matrix designed and reviewed. Missing a cell = finding. Applies especially to: expert queue (web/iOS adult), kids expert sessions (iOS + admin), discussion area (comments + replies + flag/report/hide flows), moderation queue, appeals, access requests.

## §4 — Cross-platform parity

Same feature on web, iOS, kids iOS should feel like the same product.

- §4.1 Copy matches across platforms unless platform constraints force divergence (length, capitalization).
- §4.2 *(seed: when divergence is allowed)*

## §5 — Copy / voice

- §5.1 Never give users timelines for our work. No "coming soon" / "in the next pass" in shippable copy. Describe present state.
- §5.2 Under-promise.
- §5.3 *(seed: tone — formal / friendly / direct)*

## §6 — Accessibility

- §6.1 *(seed: VoiceOver / Dynamic Type baseline for iOS)*
- §6.2 *(seed: keyboard nav baseline for web)*
- §6.3 *(seed: alt text policy for images)*

## §7 — Out of scope (don't flag as bugs)

- §7.1 Kill-switched surfaces per CLAUDE.md (public profile, OAuth buttons, kids web, etc.). Flag *broken chrome on the disabled surface* only, prefixed `[KILL-SWITCHED]`.
- §7.2 Email notification UI promising features beyond security-only (password reset / verify / billing / deletion). Email is intentionally narrow.
- §7.3 *(seed: features explicitly dropped from launch — credibility ring/pill, F2/F3, etc.)*

## §8 — Engagement bar

- §8.1 Owner-stated quality floor: 90%+ retention, ~100%/day growth on agent-touched features. Bias toward polish over ship-now.

---

*Items marked `(seed: …)` are placeholders to be answered in the seeding session. Once answered, replace with the rule.*
