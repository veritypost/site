/**
 * Markdown -> sanitized HTML for articles.body_html.
 *
 * Server-only. Uses `marked` for markdown -> HTML and `sanitize-html`
 * (Node-native, parse5/htmlparser2-based) for the safety pass. Does NOT
 * depend on jsdom — the prior `isomorphic-dompurify` path pulled jsdom
 * transitively and broke under Vercel's Node 20 runtime when
 * `html-encoding-sniffer` required `@exodus/bytes` (ESM) via CommonJS
 * (ERR_REQUIRE_ESM at module load).
 *
 * Caller contract: writer step emits markdown body, orchestrator pipes it
 * through this helper before handing to persist_generated_article RPC
 * (which rejects empty body_html per F7 Phase 3 Task 13). Also called
 * from /api/admin/articles/[id] PATCH on admin manual edits.
 *
 * Allowlist mirrors DOMPurify's `USE_PROFILES: { html: true }` shape so
 * editor pastes (images, links with rel/title, syntax-highlight class on
 * code) survive sanitization the same way they did before. Schemes are
 * restricted to http/https/mailto for hrefs, http/https/data for img src.
 * Inline styles, scripts, iframes, and event handlers are dropped.
 *
 * Pipeline (post markdown parse, pre sanitize):
 *   parse -> insertPullQuote -> markOverCapParagraphs -> sanitize
 *
 * Pull quote (item #13): purely render-side heuristic; long adult articles
 * (>=5 <p>) get one <aside class="pull-quote"> swapped in for the first
 * non-lede paragraph that contains a quoted/attributed clause and clocks
 * in between 8 and 35 words. No LLM marker, no schema change.
 *
 * Over-cap warning (item #14 render-side): paragraphs >70 words get
 * class="over-cap". The class ships in body_html for inspection and
 * future admin tooling; no visual rule fires today (no admin preview
 * surface exists yet). Public reader leaves them unstyled.
 *
 * Platform applicability (LockedDecisions #18):
 *   - Web: applicable (this is the server-side body_html pipeline).
 *   - iOS adult: not applicable — iOS reads articles.body (plaintext
 *     markdown), never body_html.
 *   - iOS Kids: not applicable — same plaintext body path.
 */

// T223 — `sanitize-html` is a Node-native sanitizer (~50KB + parse5
// transitive deps); pulling it into a client bundle would be pure
// dead weight. `import 'server-only'` makes Next.js throw at build
// time if any client component reaches this module.
import 'server-only';

import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
    'mark', 'abbr', 'cite', 'q', 'small',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote',
    'a',
    'img', 'figure', 'figcaption',
    'pre', 'code', 'kbd', 'samp', 'var',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'caption', 'col', 'colgroup',
    'div', 'span',
    'aside',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    p: ['class'],
    aside: ['class'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  // Lock the class surface — only these named classes survive sanitization.
  // sanitize-html strips any class attribute value not present in this map.
  allowedClasses: {
    aside: ['pull-quote'],
    p: ['over-cap'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  disallowedTagsMode: 'discard',
};

// Paragraph regex: <p>...</p> with non-greedy inner. The marked output for
// a body paragraph is always a single-line `<p>...</p>`; nested block-level
// HTML inside <p> doesn't happen because marked promotes those into siblings.
const P_TAG_RE = /<p>([\s\S]*?)<\/p>/g;

// Quote-clause detector: curly double quotes OR straight double quotes
// surrounding any non-trivial run. The marked output preserves whichever
// the source markdown used.
const QUOTE_CLAUSE_RE = /[“”].+?[“”]|"[^"]+"/;

// Attribution-clause detector: classic news verbs that indicate a sourced
// statement. Word-bounded so we don't match "saidler" etc.
const ATTRIBUTION_RE = /\b(according to|said|told|wrote)\b/i;

function countWords(text: string): number {
  // Strip inline tags; word-split on whitespace runs.
  const stripped = text.replace(/<[^>]+>/g, ' ').trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

/**
 * Item #13 — pull-quote heuristic. Mutates HTML by swapping the first
 * qualifying <p> for an <aside class="pull-quote">. Returns input unchanged
 * if fewer than 5 paragraphs or no candidate matches.
 */
function insertPullQuote(html: string): string {
  // Cheap pre-flight: skip work entirely if too few paragraphs.
  const paragraphs: { match: string; inner: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  P_TAG_RE.lastIndex = 0;
  while ((m = P_TAG_RE.exec(html)) !== null) {
    paragraphs.push({ match: m[0], inner: m[1], index: m.index });
  }
  if (paragraphs.length < 5) return html;

  // Skip P1 (the lede). Find first qualifier from index 1 onward.
  for (let i = 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const words = countWords(p.inner);
    if (words < 8 || words > 35) continue;
    const hasQuote = QUOTE_CLAUSE_RE.test(p.inner);
    const hasAttribution = ATTRIBUTION_RE.test(p.inner);
    if (!hasQuote && !hasAttribution) continue;

    // Replace just this one paragraph (not all <p>) by slicing.
    const before = html.slice(0, p.index);
    const after = html.slice(p.index + p.match.length);
    return `${before}<aside class="pull-quote">${p.inner}</aside>${after}`;
  }
  return html;
}

/**
 * Item #14 (render-side) — flag paragraphs over 70 words with class="over-cap".
 * Admin preview styles render the visual warning; public reader CSS does not
 * style this class so readers see no difference.
 */
function markOverCapParagraphs(html: string): string {
  return html.replace(P_TAG_RE, (full, inner) => {
    if (countWords(inner) > 70) {
      return `<p class="over-cap">${inner}</p>`;
    }
    return full;
  });
}

export function renderBodyHtml(markdown: string): string {
  if (!markdown) return '';
  // marked.parse returns string when `async: false` — cast verified against
  // marked@^18 types (parse can return Promise<string> when awaited async).
  const raw = marked.parse(markdown, { async: false }) as string;
  const withPullQuote = insertPullQuote(raw);
  const withOverCap = markOverCapParagraphs(withPullQuote);
  return sanitizeHtml(withOverCap, SANITIZE_OPTIONS);
}
