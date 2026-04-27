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
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  disallowedTagsMode: 'discard',
};

export function renderBodyHtml(markdown: string): string {
  if (!markdown) return '';
  // marked.parse returns string when `async: false` — cast verified against
  // marked@^18 types (parse can return Promise<string> when awaited async).
  const raw = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(raw, SANITIZE_OPTIONS);
}
