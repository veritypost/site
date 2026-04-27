// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
import { ImageResponse } from 'next/og';
import { createClient } from '../../../lib/supabase/server';

export const alt = 'Verity Post profile card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function initial(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

// Rendered social-share card. Mirrors the in-app /card/[username]
// layout but in a wider 1200x630 format. Falls back to a brand plate
// if the target isn't viewable / is private / doesn't exist, so crawlers
// don't get 500s.
export default async function Image({ params }) {
  const { username } = await params;
  const supabase = createClient();

  // T300 — read via public_profiles_v (whitelisted + filtered to public).
  const { data: target } = await supabase
    .from('public_profiles_v')
    .select(
      'id, username, display_name, bio, avatar_color, verity_score, streak_current, profile_visibility'
    )
    .eq('username', username)
    .maybeSingle();

  // Q1 — OG is the social preview for a public share surface. No viewer
  // auth check: social crawlers (Facebook, Twitter, LinkedIn, iMessage,
  // Slack) request this unauthenticated, so gating on a permission key
  // meant every share rendered as the brand plate. Target-side fallbacks
  // stay so a deleted or explicitly-private user never leaks via OG.
  const brandPlate = (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#111',
        color: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 56,
        fontWeight: 800,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      Verity Post
    </div>
  );

  // 'hidden' is the safety lockdown tier; render the brand plate too.
  if (
    !target ||
    target.profile_visibility === 'private' ||
    target.profile_visibility === 'hidden'
  ) {
    return new ImageResponse(brandPlate, { ...size });
  }

  let topCategories = [];
  try {
    const { data: catRows } = await supabase
      .from('category_scores')
      .select('score, categories(name)')
      .eq('user_id', target.id)
      .is('kid_profile_id', null)
      .order('score', { ascending: false })
      .limit(3);
    topCategories = (catRows || []).filter((r) => (r.score || 0) > 0);
  } catch {}

  const name = target.display_name || target.username;
  const bio = (target.bio || '').slice(0, 180);
  const score = target.verity_score ?? 0;
  const streak = target.streak_current ?? 0;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        padding: '56px 64px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#111',
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: '#888',
        }}
      >
        Verity Post
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 40 }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 70,
            background: target.avatar_color || '#999',
            color: '#fff',
            fontSize: 72,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {initial(name)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 26, color: '#666', marginTop: 6 }}>@{target.username}</div>
        </div>
      </div>

      {bio && (
        <div style={{ fontSize: 24, lineHeight: 1.4, color: '#333', marginTop: 28, flex: 1 }}>
          {bio}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 32,
          marginTop: 'auto',
          paddingTop: 24,
          borderTop: '2px solid #e5e5e5',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 16,
              color: '#666',
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Verity Score
          </div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>{score}</div>
        </div>
        {streak > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 16,
                color: '#666',
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Streak
            </div>
            <div style={{ fontSize: 44, fontWeight: 800 }}>Day {streak}</div>
          </div>
        )}
        {topCategories.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                color: '#666',
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Top categories
            </div>
            <div style={{ fontSize: 22, marginTop: 4, display: 'flex', gap: 18 }}>
              {topCategories.map((c, i) => (
                <span key={i}>
                  {c.categories?.name || ''} {c.score}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    { ...size }
  );
}
