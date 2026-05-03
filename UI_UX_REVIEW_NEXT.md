# UI/UX Review — Cursor

Single-line state for the review system. Updated automatically at session end.

```
CURRENT_PHASE: auto-detect
CURRENT_UNIT: pending
CURRENT_TITLE: Unit 5 — Category (/category/[id])
CURRENT_WAVE: A
CURRENT_DOC: UI_UX_REVIEW/A-5-category.md
STATUS: pending
NEXT_BUILD_SLICE: Unit 5 review → Slice 13 (Category fix)
ANCHOR: Slice 12 (Search) shipped 2026-05-02. 29 findings fixed; F20 refuted; F28/F32 deferred. tsc clean, smoke PASS, pushed. Unit 4 → fixed. Auto-detect next: (e) Unit 5 review.
LAST_UPDATED: 2026-05-02

PARKED_UNITS:
- Unit 1 (Home) — status: fixed (Slice 3 shipped 2026-05-02). HomeBrokenPinBanner admin signal TODO in page.tsx.
- Unit 2 (Article reader) — status: fixed (Slices 4+5 shipped 2026-05-02). All 128 findings resolved.
- Unit 3 (Browse) — status: fixed (Slice 11 shipped 2026-05-02). All 38 findings resolved.
- Unit 4 (Search) — status: fixed (Slice 12 shipped 2026-05-02). 29 findings fixed.

EXECUTION_PLAN: UI_UX_REVIEW_SLICES.md
SLICE_NAMING: sequential numbers (Slice 1, 2, 3, ...). See SLICES.md tracking table for type (Foundation / Unit fix / Cross-cutting / Verification) and dependencies.

DEFAULT_PROMPT (paste this every session — auto-detect handles the rest):
  "Continue UI/UX review per UI_UX_REVIEW.md."

DIRECTED_PROMPTS (only if you want to force a specific slice instead of auto-detect):
- Slice 1 (god_mode rename): "Execute Slice 1 per UI_UX_REVIEW_SLICES.md."
- Slice 2 (subcategory schema): "Execute Slice 2 per UI_UX_REVIEW_SLICES.md."
- Slice 3 (Home cleanup): "Execute Slice 3 per UI_UX_REVIEW_SLICES.md."
- Slice 4 (Article reader layout): "Execute Slice 4 per UI_UX_REVIEW_SLICES.md."
- Slice 5 (Article reader cleanup): "Execute Slice 5 per UI_UX_REVIEW_SLICES.md."
- Slice 6 (Registration wall): "Execute Slice 6 per UI_UX_REVIEW_SLICES.md."
- Slice 7 (Admin ad system): "Execute Slice 7 per UI_UX_REVIEW_SLICES.md."
- Slice 8 (iOS CSAM bridge): "Execute Slice 8 per UI_UX_REVIEW_SLICES.md."
- Slice 9 (Parity bridges): "Execute Slice 9 per UI_UX_REVIEW_SLICES.md."
- Slice 10 (Wave A verification): "Execute Slice 10 per UI_UX_REVIEW_SLICES.md."
- Force a specific unit review: "Continue UI/UX review per UI_UX_REVIEW.md. Skip slice auto-detect; review Unit <N> instead."

CONTINUATION_PROMPTS:
- For Slice 0a (subcategory schema): "Execute Slice 0a per UI_UX_REVIEW_SLICES.md. Start with MCP-verifying current schema, write the migration, regenerate types, build admin CRUD, test."
- For Slice 0b (god_mode rename): "Execute Slice 0b per UI_UX_REVIEW_SLICES.md. Grep for every god_mode reference, rename to owner_mode in code + DB, verify with second grep showing zero matches outside docs."
- For Unit-2 broken-state fix-pass (after Slices 0 + 1): "Execute Slice 2 per UI_UX_REVIEW_SLICES.md. Use the 4-stream parallel cleanup pattern (Streams A/B/C/D in parallel implementer agents + Stream E verification). Per-finding fix recipes are in the slice doc."
- For final verification sweep: "Execute Slice 7 per UI_UX_REVIEW_SLICES.md. Walk the verification matrix; log any bugs to UI_UX_REVIEW/A-2-final-sweep-bugs.md."
```

**Status values:** `pending` | `in-review` | `findings` | `fixed` | `verified`
**Anchor:** human-readable pointer to where in the unit's review the previous session ended (e.g. "after finding #4, before fixes pass").
