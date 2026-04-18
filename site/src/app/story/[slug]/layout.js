import { createClient } from '../../../lib/supabase/server';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const supabase = createClient();

  const { data: story } = await supabase
    .from('articles')
    .select('title, excerpt, published_at, cover_image_url, cover_image_alt')
    .eq('slug', slug)
    .maybeSingle();

  if (!story) {
    return { title: 'Article not found — Verity Post' };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const title = `${story.title} — Verity Post`;
  const description = story.excerpt?.slice(0, 160) || 'News you can trust.';
  const path = `/story/${slug}`;

  // Prefer the editor-curated cover image when present. Fall back to
  // the article-aware opengraph-image route which renders title + excerpt.
  const ogImage = story.cover_image_url
    ? { url: story.cover_image_url, alt: story.cover_image_alt || story.title }
    : { url: `${base}${path}/opengraph-image`, alt: story.title };

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'article',
      publishedTime: story.published_at || undefined,
      siteName: 'Verity Post',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage.url],
    },
  };
}

export default function StoryLayout({ children }) {
  return <>{children}</>;
}
