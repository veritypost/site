// Article-aware OG image. Fallback for articles without a curated
// cover_image_url — renders title + excerpt + brand plate so social
// shares are legible. Runs at request time (Node runtime) so the
// Supabase server client works. Slug-keyed via the resolver in
// page.tsx: `stories.slug` lookup → newest published article.
//
// Was at /story/[slug]/opengraph-image.js before canonical URL flip
// (Stage 1 of the /story/-prefix retirement); duplicated here on the
// canonical /{slug} route so the social-share fallback works regardless
// of which path crawlers hit.

import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/server';

export const alt = 'Verity Post article';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const service = createServiceClient();
  // Resolve the story by slug, then the newest published article for
  // that story — mirrors the page.tsx fetchBySlug path so the OG image
  // tracks the article a user would actually land on.
  const { data: story } = await service
    .from('stories')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle();
  let title = 'Verity Post';
  let excerpt = '';
  if (story) {
    const storyRow = story as { id: string; title: string };
    const { data: article } = await service
      .from('articles')
      .select('title, excerpt')
      .eq('story_id', storyRow.id)
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const articleRow = article as { title: string; excerpt: string | null } | null;
    title = (articleRow?.title || storyRow.title || 'Verity Post').slice(0, 140);
    excerpt = (articleRow?.excerpt || '').slice(0, 220);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#111',
          color: '#f5f5f5',
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#888',
          }}
        >
          Verity Post
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1, marginBottom: 24 }}>
            {title}
          </div>
          {excerpt && <div style={{ fontSize: 28, lineHeight: 1.4, color: '#bbb' }}>{excerpt}</div>}
        </div>
        <div style={{ fontSize: 22, color: '#666', borderTop: '2px solid #333', paddingTop: 20 }}>
          News you can trust
        </div>
      </div>
    ),
    { ...size },
  );
}
