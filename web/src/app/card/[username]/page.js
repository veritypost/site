// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
};

function initials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function roleBadgeLabel(roles) {
  const priority = ['journalist', 'expert', 'educator'];
  const match = priority.find((r) => roles?.includes(r));
  if (!match) return null;
  return match.charAt(0).toUpperCase() + match.slice(1);
}

export default function CardPage() {
  const { username } = useParams();
  const supabase = useMemo(() => createClient(), []);
  const [target, setTarget] = useState(null);
  const [categories, setCategories] = useState([]);
  const [roles, setRoles] = useState([]);
  const [state, setState] = useState('loading');
  const [copied, setCopied] = useState(false);
  // Q1 — card is fully public. We still track viewer auth so the
  // "View full profile" CTA can route anon visitors through signup
  // (with `next` preserved) while authed viewers go straight to /u/<name>.
  const [viewerIsAuthed, setViewerIsAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      // Q1 — card is fully public. No viewer-side permission check:
      // `profile.card.view` was removed as a gate because crawlers and
      // anon recipients of shared card links must be able to render the
      // card and its OG image. Target-side checks (user exists, not
      // deleted, not `profile_visibility='private'`) remain below.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setViewerIsAuthed(!!user);

      const { data: targetRow } = await supabase
        .from('users')
        .select(
          'id, username, display_name, bio, avatar_url, avatar_color, verity_score, streak_current, is_expert, expert_title, expert_organization, profile_visibility'
        )
        .eq('username', username)
        .maybeSingle();

      if (!targetRow) {
        setState('not_found');
        return;
      }
      if (targetRow.profile_visibility === 'private') {
        setState('private');
        return;
      }

      setTarget(targetRow);

      const { data: catRows } = await supabase
        .from('category_scores')
        .select('score, categories(name)')
        .eq('user_id', targetRow.id)
        .is('kid_profile_id', null)
        .order('score', { ascending: false })
        .limit(5);
      setCategories((catRows || []).filter((r) => (r.score || 0) > 0));

      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', targetRow.id);
      setRoles((roleRows || []).map((r) => r.roles?.name).filter(Boolean));

      setState('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (state === 'loading') {
    return <div style={{ padding: 48, textAlign: 'center', color: C.dim }}>Loading card...</div>;
  }
  if (state === 'not_found') {
    return <div style={{ padding: 48, textAlign: 'center', color: C.dim }}>No user found.</div>;
  }
  if (state === 'private') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.dim }}>This profile is private.</div>
    );
  }

  const badge = roleBadgeLabel(roles);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        padding: '32px 16px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '28px 24px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: target.avatar_color || '#999',
                color: '#fff',
                fontSize: 26,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {target.avatar_url ? (
                // Avatar lives on Supabase storage; next/image requires
                // an allow-list per host and a sized frame. For a 64px
                // round avatar the optimizer savings don't justify the
                // config overhead. Plain img is intentional.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={target.avatar_url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                initials(target.display_name || target.username)
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                {target.display_name || target.username}
              </div>
              <div style={{ fontSize: 13, color: C.dim }}>@{target.username}</div>
              {badge && (
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: 6,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    background: C.text,
                    color: '#fff',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}
                >
                  {badge}
                </div>
              )}
            </div>
          </div>

          {target.bio && (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.text, marginBottom: 16 }}>
              {target.bio}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                flex: 1,
                padding: '10px 12px',
                background: '#fff',
                border: `1px solid ${C.border}`,
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>Verity Score</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>
                {target.verity_score ?? 0}
              </div>
            </div>
            {(target.streak_current ?? 0) > 0 && (
              <div
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: '#fff',
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>Streak</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>
                  Day {target.streak_current}
                </div>
              </div>
            )}
          </div>

          {categories.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: C.dim,
                  fontWeight: 600,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Top categories
              </div>
              {categories.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: C.text }}>
                    {c.categories?.name || 'Unknown'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.score}</span>
                </div>
              ))}
            </div>
          )}

          {/* Q1 — auth-aware profile link. Authed viewers go directly to
           *  /u/<username>; anon viewers get bounced to /signup with the
           *  profile URL in `next` so they land on the intended profile
           *  after account creation (whenever /signup starts honoring
           *  `next` — see tracker for the pre-existing gap). */}
          <a
            href={
              viewerIsAuthed
                ? `/u/${target.username}`
                : `/signup?next=${encodeURIComponent(`/u/${target.username}`)}`
            }
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '10px 0',
              background: C.text,
              color: '#fff',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              marginBottom: 8,
            }}
          >
            View full profile
          </a>

          <button
            onClick={copyLink}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 0',
              background: 'transparent',
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Link copied' : 'Copy card link'}
          </button>

          <div
            style={{
              marginTop: 14,
              textAlign: 'center',
              fontSize: 10,
              color: C.dim,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Verity Post
          </div>
        </div>
      </div>
    </div>
  );
}
