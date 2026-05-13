// Stream B — Editor's Edge hero strip at the top of pane 3.
// Server component. Fetches the current pick for the (category, sub)
// pair via the public API. Returns null on miss — there is no fallback
// content per BUILD.md locked decision #7 ("Stale-Edge fallback:
// nothing renders").

import ArticleCard from './ArticleCard';
import type { EditorsEdgeResponse } from '@/lib/directory/types';
import { headers } from 'next/headers';

interface EditorsEdgeStripProps {
  categorySlug: string;
  subSlug?: string | null;
}

async function fetchEdge(
  categorySlug: string,
  subSlug: string | null,
): Promise<EditorsEdgeResponse> {
  // RSCs need an absolute URL when calling internal API routes during
  // server render. Headers gives us the request host; this matches the
  // pattern used elsewhere in the app for server-to-API calls.
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || 'https';
  const base = `${proto}://${host}`;

  const params = new URLSearchParams({ category: categorySlug });
  if (subSlug) params.set('sub', subSlug);

  try {
    const res = await fetch(`${base}/api/directory/editors-edge?${params.toString()}`, {
      // 60s cache aligns with the route's Cache-Control header.
      next: { revalidate: 60 },
    });
    if (!res.ok) return { pick: null };
    return (await res.json()) as EditorsEdgeResponse;
  } catch {
    return { pick: null };
  }
}

export default async function EditorsEdgeStrip({
  categorySlug,
  subSlug,
}: EditorsEdgeStripProps) {
  const { pick } = await fetchEdge(categorySlug, subSlug ?? null);
  if (!pick) return null;

  return (
    <section
      aria-label="Editor's Edge"
      style={{
        borderBottom: '1px solid var(--border, #dcdcdc)',
        background: 'var(--bg, #fcfcfc)',
      }}
    >
      <div
        style={{
          padding: '16px 24px 0',
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--accent, #e33010)',
        }}
      >
        Editor’s Edge
      </div>
      <ArticleCard article={pick} edgeStyle />
    </section>
  );
}
