import { createClient } from '../lib/supabase/server';

export default async function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';

  const staticRoutes = [
    '', '/browse', '/search', '/kids', '/how-it-works',
    '/privacy', '/terms', '/cookies', '/dmca', '/accessibility',
    '/login', '/signup',
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'hourly' : 'weekly',
    priority: path === '' ? 1.0 : 0.6,
  }));

  let storyRoutes = [];
  try {
    const supabase = createClient();
    // is_kids_safe means "appropriate for kids" — many adult articles have
    // it true (Science, Health, Nature). Filtering on it drops adult-safe
    // articles from Google. Kids-only rows are identified by a `kids-` slug
    // prefix, matching the home feed behaviour.
    const { data: stories } = await supabase
      .from('articles')
      .select('slug, published_at, created_at')
      .eq('status', 'published')
      .not('slug', 'like', 'kids-%')
      .order('published_at', { ascending: false })
      .limit(5000);

    storyRoutes = (stories || []).map((s) => ({
      url: `${base}/story/${s.slug}`,
      lastModified: s.published_at || s.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));
  } catch (err) {
    console.error('[sitemap] failed to fetch stories:', err?.message || err);
  }

  return [...staticRoutes, ...storyRoutes];
}
