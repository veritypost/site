// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
import { createClient } from '../../../lib/supabase/server';
import { getSiteUrl } from '../../../lib/siteUrl';

export async function generateMetadata({ params }) {
  const { username } = await params;
  const supabase = createClient();

  // T300 — read via public_profiles_v (whitelisted + filtered to public).
  const { data: target } = await supabase
    .from('public_profiles_v')
    .select('username, display_name, bio, verity_score, profile_visibility')
    .eq('username', username)
    .maybeSingle();

  // Q1 — card is a public share surface. The viewer-side permission check
  // (`profile.card.view`) was removed; only target-side checks remain so a
  // shared link to a deleted or explicitly-private user renders a neutral
  // title rather than leaking the display name via metadata. `noindex`
  // applies across every branch — the card page should never rank above
  // canonical article content for a person's name in search.
  // 'hidden' is the safety lockdown tier; same handling as 'private' on
  // every public read path.
  if (
    !target ||
    target.profile_visibility === 'private' ||
    target.profile_visibility === 'hidden'
  ) {
    return {
      title: 'Profile card — Verity Post',
      robots: { index: false, follow: false },
    };
  }

  // getSiteUrl throws in prod when NEXT_PUBLIC_SITE_URL is unset — keep
  // OG share URLs from leaking prod from a preview branch.
  const base = getSiteUrl();
  const name = target.display_name || target.username;
  const title = `${name}'s card — Verity Post`;
  const description =
    target.bio?.slice(0, 160) ||
    `${name} on Verity Post. Verity Score ${target.verity_score ?? 0}.`;
  const path = `/card/${username}`;
  const ogImage = `${base}${path}/opengraph-image`;

  return {
    title,
    description,
    // Cards are not canonical article content. Share-friendly OG stays so
    // iMessage/Slack/Twitter previews render, but Google shouldn't rank a
    // card page for anyone's name. noindex + nofollow always.
    robots: { index: false, follow: false },
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
