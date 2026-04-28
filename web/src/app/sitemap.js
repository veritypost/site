import { createClient } from '../lib/supabase/server';
import { getSiteUrl } from '../lib/siteUrl';

// Coming-soon gate: while the site is in holding, sitemap.xml advertises
// only the root URL. Broadcasting /story/*, /category/*, /browse, /privacy,
// etc. tells Google the URL structure even though middleware redirects
// each of those to /welcome (which is disallowed in robots.js). Keep the
// sitemap silent in coming-soon mode so the crawler doesn't have a list
// of structured URLs to index-attempt. Flip back to full sitemap (static
// routes + story + category) once NEXT_PUBLIC_SITE_MODE is no longer
// 'coming_soon'.
const IS_COMING_SOON = process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon';

// Ext-SS.4 — chunked sitemaps + Next-generated sitemap index. Replaces
// the prior single-file `.limit(5000)` cap with paged sitemaps so we
// scale past 5K articles without dropping the tail. Next.js's
// generateSitemaps() spec produces sitemap-index.xml automatically
// pointing at sitemap/{id}.xml chunks.
const CHUNK_SIZE = 5000;
const STATIC_CHUNK_ID = 0;

// generateSitemaps() returns the chunk descriptors. Chunk 0 is static
// routes + categories; chunks 1..N are article pages, CHUNK_SIZE per
// chunk, ordered newest-first.
export async function generateSitemaps() {
  if (IS_COMING_SOON) return [{ id: STATIC_CHUNK_ID }];

  let articleCount = 0;
  try {
    const supabase = createClient();
    // Decision 22 — kids/tweens articles excluded from the sitemap for
    // COPPA risk reduction. Filter on age_band (canonical column) instead
    // of the prior slug.like.kids-% prefix hack.
    const { count } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('age_band', 'adult');
    articleCount = count || 0;
  } catch (err) {
    console.error('[sitemap.generateSitemaps] count failed:', err?.message || err);
  }

  // Chunk 0 = static + categories; chunks 1..N = article pages.
  const articleChunks = Math.max(1, Math.ceil(articleCount / CHUNK_SIZE));
  const ids = [{ id: STATIC_CHUNK_ID }];
  for (let i = 1; i <= articleChunks; i++) ids.push({ id: i });
  return ids;
}

export default async function sitemap({ id }) {
  const base = getSiteUrl();

  if (IS_COMING_SOON) {
    return [
      {
        url: base,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1.0,
      },
    ];
  }

  // Chunk 0 — static routes + categories
  if (id === STATIC_CHUNK_ID) {
    const staticRoutes = [
      '',
      '/browse',
      '/contact',
      '/privacy',
      '/terms',
      '/cookies',
      '/dmca',
      '/accessibility',
    ].map((path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: path === '' ? 'hourly' : 'weekly',
      priority: path === '' ? 1.0 : 0.6,
    }));

    let categoryRoutes = [];
    try {
      const supabase = createClient();
      const { data: cats } = await supabase
        .from('categories')
        .select('slug, updated_at, created_at')
        .eq('is_active', true)
        .not('slug', 'like', 'kids-%')
        .order('slug', { ascending: true });
      categoryRoutes = (cats || []).map((c) => ({
        url: `${base}/category/${c.slug}`,
        lastModified: c.updated_at || c.created_at || new Date(),
        changeFrequency: 'daily',
        priority: 0.7,
      }));
    } catch (err) {
      console.error('[sitemap.static] categories fetch failed:', err?.message || err);
    }

    return [...staticRoutes, ...categoryRoutes];
  }

  // Chunks 1..N — article pages, CHUNK_SIZE per chunk, newest-first.
  const offset = (id - 1) * CHUNK_SIZE;
  let storyRoutes = [];
  try {
    const supabase = createClient();
    // Decision 22 — adults only. Kids + tweens stay out of Google. Path
    // is the canonical /<slug> per Session C; /story/<slug> redirects
    // to it but isn't worth listing.
    const { data: stories } = await supabase
      .from('articles')
      .select('slug, published_at, updated_at, created_at')
      .eq('status', 'published')
      .eq('age_band', 'adult')
      .order('published_at', { ascending: false })
      .range(offset, offset + CHUNK_SIZE - 1);
    storyRoutes = (stories || []).map((s) => ({
      url: `${base}/${s.slug}`,
      lastModified: s.updated_at || s.published_at || s.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));
  } catch (err) {
    console.error('[sitemap.articles] chunk', id, 'failed:', err?.message || err);
  }

  return storyRoutes;
}
