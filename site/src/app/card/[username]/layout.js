import { createClient } from '../../../lib/supabase/server';
import { isPaidTier } from '@/lib/tiers';

export async function generateMetadata({ params }) {
  const { username } = await params;
  const supabase = createClient();

  const { data: target } = await supabase
    .from('users')
    .select('username, display_name, bio, verity_score, profile_visibility, plans(tier)')
    .eq('username', username)
    .maybeSingle();

  if (!target || target.profile_visibility === 'private' || !isPaidTier(target.plans?.tier)) {
    return { title: 'Profile card not available — Verity Post', robots: { index: false, follow: false } };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const name = target.display_name || target.username;
  const title = `${name} — Verity Post`;
  const description = target.bio?.slice(0, 160)
    || `${name} on Verity Post. Verity Score ${target.verity_score ?? 0}.`;
  const path = `/card/${username}`;
  const ogImage = `${base}${path}/opengraph-image`;

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
      images: [{ url: ogImage, alt: `${name} profile card` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function CardLayout({ children }) {
  return <>{children}</>;
}
