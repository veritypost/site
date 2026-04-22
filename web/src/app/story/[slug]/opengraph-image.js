// @migrated-to-permissions 2026-04-18
// @feature-verified article_reading 2026-04-18
import { ImageResponse } from 'next/og';
import { createClient } from '../../../lib/supabase/server';

export const alt = 'Verity Post article';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fallback OG image when an article has no cover_image_url. Renders
// title + excerpt + brand plate so social-share previews are legible.
// Runs at request time (not edge) so the Supabase server client works.
export default async function Image({ params }) {
  const { slug } = await params;
  const supabase = createClient();
  const { data: story } = await supabase
    .from('articles')
    .select('title, excerpt')
    .eq('slug', slug)
    .maybeSingle();

  const title = (story?.title || 'Verity Post').slice(0, 140);
  const excerpt = (story?.excerpt || '').slice(0, 220);

  return new ImageResponse(
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
    </div>,
    { ...size }
  );
}
