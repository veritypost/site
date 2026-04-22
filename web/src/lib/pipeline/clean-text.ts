/**
 * HTML/markdown stripper applied to every LLM text output before DB write.
 *
 * PROVENANCE: Ported verbatim from
 *   verity-post-pipeline-snapshot/existingstorystructure/api/ai/pipeline/route.js L51-67
 *   sha256 (source file): a9540599df547a3c4b98f4015fc05ebf1061dbf6576587dfe59cf34e7edac82c
 *   ported: 2026-04-22 (F7 Phase 2 Task 5 — pre-flight #9)
 *
 * RULE: Regexes and chain order are copied CHARACTER-FOR-CHARACTER. Do not
 * reorder, merge, add /u or /s flags, or introduce additional null/type guards.
 * The only intentional deviations vs. snapshot:
 *   1. Named export from standalone module (was inline in route.js).
 *   2. TypeScript signature (input: string): string.
 *   3. Parameter rename text -> input.
 *   4. This header.
 *
 * Known quirks preserved from snapshot (do NOT "fix"):
 *   - /---+/g strips any run of 3+ hyphens, including mid-prose.
 *   - /<!--.*?-->/g has no /s flag, so multi-line HTML comments survive.
 *   - Bold markdown stripped before italic (order-dependent).
 *
 * Called by every pipeline step that writes LLM output to the DB (headline,
 * body, summary, timeline events, quiz questions, kid copy). Pure, no I/O.
 */

// Strip HTML tags, entities, and markdown artifacts from text
export function cleanText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]+>/g, '')                    // HTML tags
    .replace(/&[a-z]+;/gi, ' ')                 // HTML entities like &nbsp;
    .replace(/&#\d+;/g, ' ')                    // numeric entities
    .replace(/\*\*(.+?)\*\*/g, '$1')            // bold markdown
    .replace(/\*(.+?)\*/g, '$1')                // italic markdown
    .replace(/^#{1,6}\s+/gm, '')                // markdown headers
    .replace(/^[-*]\s+/gm, '')                  // markdown bullets
    .replace(/^>\s+/gm, '')                     // markdown blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')    // markdown links
    .replace(/<!--.*?-->/g, '')                  // HTML comments
    .replace(/---+/g, '')                        // horizontal rules
    .replace(/\n{3,}/g, '\n\n')                  // excessive newlines
    .trim();
}
