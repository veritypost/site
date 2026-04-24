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

export default async function sitemap() {
  // getSiteUrl throws in prod when NEXT_PUBLIC_SITE_URL is unset — fail
  // loud rather than silently emit prod URLs from a preview branch.
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

  // Public-facing, index-worthy anon routes only.
  //
  // Round D H-12 / L-01:
  // - Dropped `/search`, `/login`, `/signup` — they hold no indexable
  //   content; `/login` is also excluded in robots.js.
  // - Added `/contact` (public support intake, Round D H-11).
  // - `/kids` removed: kid-facing UI moved to the VerityPostKids iOS app;
  //   the web route now 302s via middleware.
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

  let storyRoutes = [];
  let categoryRoutes = [];
  try {
    const supabase = createClient();

    // is_kids_safe means "appropriate for kids" — many adult articles have
    // it true (Science, Health, Nature). Filtering on it drops adult-safe
    // articles from Google. Kids-only rows are identified by a `kids-` slug
    // prefix, matching the home feed behaviour.
    const [storiesRes, categoriesRes] = await Promise.all([
      supabase
        .from('articles')
        .select('slug, published_at, updated_at, created_at')
        .eq('status', 'published')
        .not('slug', 'like', 'kids-%')
        .order('published_at', { ascending: false })
        .limit(5000),
      supabase
        .from('categories')
        .select('slug, updated_at, created_at')
        .eq('is_active', true)
        .not('slug', 'like', 'kids-%')
        .order('slug', { ascending: true }),
    ]);

    // L17: sitemap silently truncates at .limit(5000). If article count
    // climbs past that, newer URLs silently stop appearing in sitemap.xml
    // and Google never discovers them. Log a warn when we hit the cap so
    // the next person on-call can see it before an indexing regression
    // materializes. Proper fix (multi-file sitemap index) waits until the
    // cap is an actual concern.
    if ((storiesRes.data || []).length >= 5000) {
      console.warn(
        '[sitemap] hit 5000-article cap — sitemap will silently truncate. Plan a sitemap index file.'
      );
    }
    storyRoutes = (storiesRes.data || []).map((s) => ({
      url: `${base}/story/${s.slug}`,
      // Prefer updated_at when set — story edits should nudge crawlers.
      lastModified: s.updated_at || s.published_at || s.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    categoryRoutes = (categoriesRes.data || []).map((c) => ({
      url: `${base}/category/${c.slug}`,
      lastModified: c.updated_at || c.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    }));
  } catch (err) {
    console.error('[sitemap] failed to fetch dynamic routes:', err?.message || err);
  }

  return [...staticRoutes, ...storyRoutes, ...categoryRoutes];
}
