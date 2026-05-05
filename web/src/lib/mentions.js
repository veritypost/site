// Mention parser for comment bodies.
//
// Two token kinds (EXPERT_THREADS.md §2 Mention syntax + Inert mentions):
//
//   1. Expert tokens — must be extracted FIRST so they don't get slurped by
//      the bare-mention regex below.
//        - `@expert_<username>`  → directed at one verified expert.
//        - `@expert`            → broadcast to all in-category experts.
//      Username segment is bounded `{2,30}` chars (parity with bare regex)
//      to prevent OOM on adversarial input (mitigation §2 #20).
//
//   2. Bare mentions — `@<username>` for non-expert users. Existing regex
//      `MENTION_RE` is preserved verbatim because two callers
//      (CommentComposer.tsx, CommentRow.tsx) iterate it directly.
//
// Backward compat: existing `MENTION_RE` export is unchanged. New
// `parseMentions(body)` returns the additive shape:
//   {
//     bare:             string[]   // usernames after bare `@`
//     expertDirected:   string[]   // usernames after `@expert_`
//     expertBroadcast:  boolean    // any standalone `@expert` token present
//   }

export const MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g;

// Word-boundary lookbehind/lookahead so we don't grab the `@expert` inside
// e.g. `email@expertise.com`, and so the username segment doesn't bleed
// into adjacent word chars.
//
// Matches `@expert` optionally followed by `_<2..30 word chars>`. Requires
// a non-word char (or string boundary) before/after, except `_` is a word
// char in JS — so the trailing boundary is `(?![a-zA-Z0-9_])` to ensure
// `@expert_maria` is one token, not `@expert` + `_maria`.
const EXPERT_TOKEN_RE = /(?<![a-zA-Z0-9_])@expert(?:_([a-zA-Z0-9_]{2,30}))?(?![a-zA-Z0-9_])/g;

/**
 * Parse a comment body into its mention components.
 *
 * @param {string|null|undefined} body
 * @returns {{
 *   bare: string[],
 *   expertDirected: string[],
 *   expertBroadcast: boolean,
 * }}
 */
export function parseMentions(body) {
  if (typeof body !== 'string' || body.length === 0) {
    return { bare: [], expertDirected: [], expertBroadcast: false };
  }

  const expertDirected = [];
  let expertBroadcast = false;

  // Walk expert tokens first; record state, then strip from a working copy
  // so the bare-mention regex below doesn't re-extract `expert` / a username
  // suffix as a bare mention.
  for (const match of body.matchAll(EXPERT_TOKEN_RE)) {
    const username = match[1]; // undefined ⇒ broadcast
    if (typeof username === 'string' && username.length > 0) {
      expertDirected.push(username);
    } else {
      expertBroadcast = true;
    }
  }

  // Strip expert tokens from a working copy. Replace with a single space so
  // we don't accidentally fuse two adjacent words into one (which the bare
  // regex could then mis-match).
  const stripped = body.replace(EXPERT_TOKEN_RE, ' ');

  const bare = [];
  for (const match of stripped.matchAll(MENTION_RE)) {
    const u = match[1];
    if (typeof u === 'string' && u.length > 0) {
      bare.push(u);
    }
  }

  // Dedup directed + bare, preserve first-seen order. Lowercase for parity
  // with the can-mention route's resolution path (it already lowercases).
  return {
    bare: dedupLower(bare),
    expertDirected: dedupLower(expertDirected),
    expertBroadcast,
  };
}

function dedupLower(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const lc = v.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    out.push(lc);
  }
  return out;
}
