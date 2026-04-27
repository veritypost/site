// @migrated-to-permissions 2026-04-18
// @feature-verified profile_card 2026-04-18
import { createClient } from '../../../lib/supabase/server';
import { getSiteUrl } from '../../../lib/siteUrl';

export async function generateMetadata({ params }) {
  const { username } = await params;
  const supabase = createClient();

  // T300 — read via public_profiles_v (whitelisted + filtered to public).
  // Private/hidden/banned/deletion-scheduled users return no row, which
  // falls into the !target branch below for the noindex metadata.
  const { data: target } = await supabase
    .from('public_profiles_v')
    .select('username, display_name, bio, profile_visibility')
    .eq('username', username)
    .maybeSingle();

  if (!target) {
    return {
      title: 'User not found — Verity Post',
      robots: { index: false, follow: false },
    };
  }

  // 'hidden' is the safety lockdown tier; treat it the same as 'private' on
  // every public read path so non-followers never see a hint of the profile.
  if (target.profile_visibility === 'private' || target.profile_visibility === 'hidden') {
    return {
      title: 'Profile — Verity Post',
      robots: { index: false, follow: false },
    };
  }

  const base = getSiteUrl();
  const name = target.display_name || target.username;
  const title = `${name} on Verity Post`;
  const description =
    target.bio?.slice(0, 160) ||
    `View ${target.username}'s Verity Post profile — quiz-gated news discussion.`;
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
