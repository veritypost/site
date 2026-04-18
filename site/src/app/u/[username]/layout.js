import { createClient } from '../../../lib/supabase/server';

export async function generateMetadata({ params }) {
  const { username } = await params;
  const supabase = createClient();

  const { data: target } = await supabase
    .from('users')
    .select('username, display_name, bio, profile_visibility')
    .eq('username', username)
    .maybeSingle();

  if (!target) {
    return {
      title: 'User not found — Verity Post',
      robots: { index: false, follow: false },
    };
  }

  if (target.profile_visibility === 'private') {
    return {
      title: 'Profile — Verity Post',
      robots: { index: false, follow: false },
    };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const name = target.display_name || target.username;
  const title = `${name} on Verity Post`;
  const description = target.bio?.slice(0, 160)
    || `View ${target.username}'s Verity Post profile — quiz-gated news discussion.`;
  const path = `/u/${username}`;
  const ogImage = { url: `${base}/card/${username}/opengraph-image`, alt: `${name} profile card` };

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'profile',
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

export default function UserLayout({ children }) {
  return <>{children}</>;
}
