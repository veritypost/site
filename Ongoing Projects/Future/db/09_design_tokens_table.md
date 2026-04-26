# db/09 — Design Tokens in DB (Rejected — Explainer)

**Owner:** Ive (primary).
**Status:** **REJECTED** for Year 1. Document exists to record the decision.
**Purpose:** Originally considered per `08_DESIGN_TOKENS.md`: would tokens live in a DB table so they're editor-adjustable without deploys?

---

## Why it was considered

DB-backed design tokens would let the team:
- A/B test typography values without deploys.
- Update per-category theming without a build.
- Centralize the token system in one mutable source.

## Why it's rejected

Four reasons:

1. **Tokens in code is simpler.** A `tokens.ts` file is typed, lint-checked, searchable. A DB table is none of those things without additional tooling.
2. **Tokens change rarely.** Once the token system is established, changes are quarterly at most. A deploy is fine.
3. **Runtime cost.** Reading tokens from DB (even cached) adds latency to first paint. Tokens from code bundle inline.
4. **Editor mutation is the wrong workflow.** Token changes are design changes. They should go through design review, code review, visual regression — not a dashboard form.

## The only valid use case we identified

Per-kid theme color. The kid picks their theme color at profile creation; this value needs to live in the DB (on `kid_profiles`). But that's already how it works — it's a user-attribute, not a design-token table.

## Revisit

Year 2, if we hit a specific case where design-team wants to A/B typography values without deploys, reopen the question. For now: tokens in code, one source of truth per platform.

## No migration

This doc intentionally has no SQL. The decision is "don't."
