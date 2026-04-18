'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import FollowButton from '../../../components/FollowButton';
import { useToast } from '../../../components/Toast';
import { assertNotKidMode } from '@/lib/guards';

// Public profile page. D28 follows + D32 banner + privacy.
const PAID = new Set(['verity', 'verity_pro', 'verity_family', 'verity_family_xl']);

export default function ProfilePage() {
  const { username } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [me, setMe] = useState(null);
  const [target, setTarget] = useState(null);
  const [myTier, setMyTier] = useState('free');
  const [tab, setTab] = useState('followers');      // 'followers' | 'following'
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    if (assertNotKidMode(router)) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('users').select('id, plans(tier)').eq('id', user.id).maybeSingle();
        setMe(meRow);
        setMyTier(meRow?.plans?.tier || 'free');
      }

      const { data: targetRow } = await supabase
        .from('users')
        .select('id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, followers_count, following_count, profile_visibility, is_expert, expert_title, expert_organization')
        .eq('username', username)
        .maybeSingle();
      if (!targetRow) { setNotFoundFlag(true); setLoading(false); return; }
      if (targetRow.profile_visibility === 'private' && (!user || user.id !== targetRow.id)) {
        setNotFoundFlag(true); setLoading(false); return;
      }
      setTarget(targetRow);

      if (user && user.id !== targetRow.id) {
        const { data: f } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', targetRow.id)
          .maybeSingle();
        setFollowing(!!f);
      }

      setLoading(false);
    })();
  }, [username]);

  useEffect(() => {
    (async () => {
      if (!target) return;
      if (tab === 'followers') {
        const { data } = await supabase
          .from('follows')
          .select('users!follows_follower_id_fkey(id, username, avatar_color, avatar_url)')
          .eq('following_id', target.id)
          .limit(100);
        setFollowers((data || []).map(r => r.users).filter(Boolean));
      } else if (tab === 'following') {
        const { data } = await supabase
          .from('follows')
          .select('users!follows_following_id_fkey(id, username, avatar_color, avatar_url)')
          .eq('follower_id', target.id)
          .limit(100);
        setFollowingList((data || []).map(r => r.users).filter(Boolean));
      }
    })();
  }, [tab, target?.id]);

  if (loading) return <div style={{ padding: 40, color: '#666' }}>Loading…</div>;
  if (notFoundFlag) return notFound();

  const viewerIsPaid = PAID.has(myTier);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 0 80px' }}>
      <div style={{
        height: 180,
        background: target.banner_url ? `center/cover url('${target.banner_url}')` : 'linear-gradient(135deg, #111, #333)',
      }} />
      <div style={{ padding: '0 16px', marginTop: -40 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: target.avatar_color || '#e5e5e5',
          border: '4px solid #fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 800, color: '#fff',
        }}>{(target.username || '?').charAt(0).toUpperCase()}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{target.display_name || target.username}</div>
            <div style={{ fontSize: 13, color: '#666' }}>@{target.username}</div>
            {target.is_expert && (
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>
                {target.expert_title ? `${target.expert_title}` : 'Expert'}
                {target.expert_organization ? ` · ${target.expert_organization}` : ''}
              </div>
            )}
          </div>
          {me && me.id !== target.id && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FollowButton
                targetUserId={target.id}
                initialFollowing={following}
                viewerTier={myTier}
                viewerUserId={me.id}
                onChange={f => setFollowing(f)}
              />
              {/* Pass 17 / UJ-609: Send message is paid-tier-only per
                * D11 and invisible to free users per D10. */}
              {viewerIsPaid && (
                <a href={`/messages/new?to=${target.id}`} style={{
                  padding: '7px 12px', borderRadius: 7, border: '1px solid #e5e5e5',
                  background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600,
                  textDecoration: 'none', display: 'inline-block',
                }}>Send message</a>
              )}
            </div>
          )}
        </div>

        {target.bio && <div style={{ fontSize: 14, color: '#333', marginTop: 10 }}>{target.bio}</div>}

        <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 13 }}>
          <div><b>{target.followers_count || 0}</b> <span style={{ color: '#666' }}>followers</span></div>
          <div><b>{target.following_count || 0}</b> <span style={{ color: '#666' }}>following</span></div>
          {viewerIsPaid && (
            <div><b>{target.verity_score || 0}</b> <span style={{ color: '#666' }}>Verity Score</span></div>
          )}
        </div>

        {/* Shareable profile card link — D32 paid-only; shows on own profile */}
        {me && me.id === target.id && viewerIsPaid && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <a href={`/card/${target.username}`} onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(`${window.location.origin}/card/${target.username}`); toast.success('Profile card link copied.'); }} style={{ color: '#111', fontWeight: 700 }}>
              Copy shareable profile card link
            </a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, margin: '20px 0 12px' }}>
          {['followers', 'following'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: tab === t ? '#111' : '#f7f7f7',
              color: tab === t ? '#fff' : '#666',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {tab === 'followers' && <UserList users={followers} />}
        {tab === 'following' && <UserList users={followingList} />}
      </div>
    </div>
  );
}

function UserList({ users }) {
  if (!users?.length) return <div style={{ padding: 30, textAlign: 'center', color: '#666', fontSize: 13 }}>Nobody here.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {users.map(u => (
        <a key={u.id} href={`/u/${u.username}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, textDecoration: 'none', color: '#111' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.avatar_color || '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>{(u.username || '?').charAt(0).toUpperCase()}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>@{u.username}</div>
        </a>
      ))}
    </div>
  );
}
