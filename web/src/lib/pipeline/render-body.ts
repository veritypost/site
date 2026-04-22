/**
 * Markdown -> sanitized HTML for articles.body_html.
 *
 * F7 Phase 3 Task 10. Uses `marked` + `isomorphic-dompurify` installed with
 * the generate endpoint. Pure, no I/O — safe to call from any runtime.
 *
 * Caller contract: writer step emits markdown body, orchestrator pipes it
 * through this helper before handing to persist_generated_article RPC
 * (which rejects empty body_html per Task 13).
 */

import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export function renderBodyHtml(markdown: string): string {
  if (!markdown) return '';
  // marked.parse returns string when `async: false` — cast verified against
  // marked@^18 types (parse can return Promise<string> when awaited async).
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
