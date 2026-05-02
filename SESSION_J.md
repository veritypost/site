# Session J — concern #31 (mute outlet rip-out)

Continue with `story_cleanup_prompt.md`. Work concern #31 in this session,
**alone — broad blast radius**.

**RUN ORDER: Wave 2 — start ONLY after Sessions F, G, H, I (Wave 1) have all
pushed and merged.** Pull origin/main first to make sure your starting tree
includes their changes. This session touches AudienceCard.tsx (Session G's
file) and newsroom page.tsx (Session F's file).

## #31 — Mute outlet: rip out, change selection semantics

The "Mute outlet" UI is dead weight. Owner wants it removed entirely.
Replacement behavior for the source checkbox on each Story:

- **Unchecked source** = NOT attached to the published article as a
  "source" row.
- **Unchecked source IS still passed** to the article-generation pipeline
  as content/context (so the AI still sees it).

Today's behavior conflates these two: unchecking removes the URL from the
generate POST body's `source_urls`, which means the AI doesn't see it AND
it can't be attached. We need to split these concerns.

## Locked decisions in scope

From `story_cleanup_state.md` locked decisions block (2026-05-02):
- "Mute outlet — DROPPED (rip out entirely). Replacement behavior: an
  unchecked source on a Story stays available to the article-generation
  pipeline as content/context but does NOT get attached to the published
  article as a 'source' row. Selection (the checkbox state) controls
  source-attachment, not whether the cluster item participates in
  generation."

This is unambiguous — don't re-litigate the design; implement it.

## File scope

Touch:
- `web/src/app/admin/newsroom/_components/AudienceCard.tsx` — generate POST
  body splits selection (attach-as-source) from inclusion (feed-to-AI).
- `web/src/app/admin/newsroom/_components/StoryCard.tsx` — sources block
  checkbox semantics.
- `web/src/app/admin/newsroom/_components/SourcesBlock.tsx` — checkbox UI.
- `web/src/app/admin/newsroom/page.tsx` — mute modal removal.
- `web/src/app/api/admin/pipeline/generate/route.ts` — accept a new field
  (or split `source_urls` into `attach_as_source_urls` + `context_urls`,
  whichever matches the existing API conventions). Pipeline persistence
  must distinguish attached sources from context-only sources.
- Any mute-outlet API route (e.g. `/api/admin/newsroom/outlets/mute`) —
  delete entirely.
- `muted_outlets` table — write a destructive migration to drop it.
  Per the loop rules: write the destructive SQL into chat and STOP for
  owner-run, do NOT execute it via MCP.

DO NOT touch StoryEditor, public story view (the public surface already
reads sources from the published-article schema).

## Concern bookkeeping

- Skip RESOLVED: #1, #2, #3, #4, #5, #7, #9, #10, #12, #14, #15, #16, #17,
  #18, #19, #20, #21, #22, #23, #24, #25, #26, #27, #30, #33.
- Wave 1 sessions resolve: #6, #8, #11, #13, #28, #29, #34. Verify those
  are RESOLVED in `story_cleanup_state.md` before starting.
- Skip DEFERRED: anything still DEFERRED in the state file.

## Parallel coordination

**You run alone.** Sessions F, G, H, I (Wave 1) must be DONE before you
start. Session K (#32 audit-failure systemic) runs AFTER you finish.

Confirm before starting:
1. `git -C /Users/veritypost/Desktop/verity-post fetch origin main`
2. `git -C /Users/veritypost/Desktop/verity-post log origin/main --oneline -10`
   — should show commits for #6, #8, #11, #13, #28, #29, #34.
3. `grep -E "^### (6|8|11|13|28|29|34)\." -A1
   /Users/veritypost/Desktop/verity-post/story_cleanup_state.md` — should
   all show Status: RESOLVED.

If any are still IN_PROGRESS or PENDING, **STOP** and report back to the
owner — you're not safe to start yet.

Push when ready: `git push origin main`.
