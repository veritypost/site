'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

function Sw({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <div style={{ width: 32, height: 18, borderRadius: 9, background: on ? C.accent : '#333', position: 'relative', transition: 'background 0.15s' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: on ? '#fff' : '#666', position: 'absolute', top: 2, left: on ? 16 : 2, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </div>
    </button>
  );
}

const numStyle = { width: 50, padding: '4px 6px', borderRadius: 4, border: '1px solid #222222', background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

const STREAK_CONFIG = [
  { k: 'streaks_enabled', l: 'Streak tracking', desc: 'Track consecutive active days per user', on: true },
  { k: 'streak_freeze', l: 'Streak freeze', desc: 'Allow users to freeze streak (missed days forgiven). Reduces churn ~21%.', on: true },
  { k: 'freeze_limit', l: 'Max freezes per month', desc: 'Limit how often streak freeze can be used', on: true, num: 'freeze_max', unit: '/month' },
  { k: 'streak_notifications', l: 'Streak reminders', desc: 'Push notification if user about to lose streak', on: true, num: 'streak_remind_hour', unit: 'pm local' },
  { k: 'streak_celebration', l: 'Streak milestones', desc: 'Celebrate streak milestones with animations', on: true },
];

const WRAPPED_CONFIG = [
  { k: 'wrapped_enabled', l: 'Knowledge Wrapped', desc: 'Periodic shareable summary of user reading activity', on: true },
  { k: 'wrapped_frequency', l: 'Wrapped frequency', desc: 'Generate Knowledge Wrapped reports every N months', on: true, num: 'wrapped_months', unit: 'months' },
  { k: 'wrapped_shareable', l: 'Shareable cards', desc: 'Generate screenshot-ready cards for social sharing', on: true },
  { k: 'wrapped_topics', l: 'Topic breakdown', desc: 'Show topics explored and Verity Score growth', on: true },
  { k: 'wrapped_comparison', l: 'Community comparison', desc: 'Show "You read more than X% of users" type stats', on: false },
];

const GAMIFICATION_CONFIG = [
  { k: 'reading_progress', l: 'Reading progress bar', desc: 'Thin progress bar at top of article showing % read', on: true },
  { k: 'reading_milestones', l: 'Reading milestones', desc: 'Subtle encouragement at progress intervals through article', on: false },
  { k: 'article_complete_ding', l: 'Article complete animation', desc: 'Satisfying micro-animation when finishing an article', on: true },
  { k: 'quiz_celebration', l: 'Quiz pass celebration', desc: 'Brief celebratory animation on correct answers', on: true },
  { k: 'achievement_toasts', l: 'Achievement notifications', desc: 'Toast popup when achievements unlock', on: true },
  { k: 'heatmap_profile', l: 'GitHub-style reading heatmap', desc: 'Reading activity calendar on profile page', on: true },
  { k: 'radar_chart', l: 'Topic expertise radar chart', desc: 'Spider chart showing per-category Verity Score on profile', on: true },
  { k: 'referral_tracking', l: 'Referral system', desc: 'Track invite links and referral signups', on: true },
  { k: 'referral_limit', l: 'Referral limit per user', desc: 'Cap referral invites per user', on: true, num: 'referral_max', unit: 'invites' },
];

export default function StreaksAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('streaks');
  const [config, setConfig] = useState(
    [...STREAK_CONFIG, ...WRAPPED_CONFIG, ...GAMIFICATION_CONFIG].reduce((acc, s) => ({ ...acc, [s.k]: s.on }), {})
  );
  const [nums, setNums] = useState({
    freeze_max: 2,
    streak_remind_hour: 10,
    wrapped_months: 3,
    referral_max: 4,
    milestone_1: 7, milestone_2: 30, milestone_3: 90, milestone_4: 365,
    reading_pct_1: 25, reading_pct_2: 50, reading_pct_3: 75,
  });
  const [topStreaks, setTopStreaks] = useState([]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: me } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!me || !['owner', 'admin'].some(r => roleNames.includes(r))) { router.push('/'); return; }

      // Fetch top streaks from users table
      const { data: streakRows } = await supabase
        .from('users')
        .select('id, username, streak_current, streak_best, last_active_at')
        .order('streak_current', { ascending: false })
        .limit(10);

      setTopStreaks(streakRows || []);

      // Load saved config from settings table
      const { data: settingsRows } = await supabase.from('settings').select('key, value').like('key', 'streak_%');
      if (settingsRows) {
        const cfg = {};
        const n = {};
        settingsRows.forEach(row => {
          const k = row.key.replace('streak_config_', '').replace('streak_num_', '');
          if (row.key.startsWith('streak_config_')) cfg[k] = row.value === 'true';
          if (row.key.startsWith('streak_num_')) n[k] = parseInt(row.value) || 0;
        });
        if (Object.keys(cfg).length) setConfig(prev => ({ ...prev, ...cfg }));
        if (Object.keys(n).length) setNums(prev => ({ ...prev, ...n }));
      }

      setLoading(false);
    }
    init();
  }, []);

  const toggle = (k) => {
    setConfig(prev => {
      const next = { ...prev, [k]: !prev[k] };
      (async () => {
        await supabase.from('settings').upsert({ key: 'streak_config_' + k, value: String(next[k]) }, { onConflict: 'key' });
        fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
      })();
      return next;
    });
  };
  const updateNum = (k, v) => {
    const val = parseInt(v) || 0;
    setNums(prev => ({ ...prev, [k]: val }));
    (async () => {
      await supabase.from('settings').upsert({ key: 'streak_num_' + k, value: String(val) }, { onConflict: 'key' });
      fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
    })();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  const renderGroup = (title, items) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <div key={item.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i === items.length - 1 ? 'none' : `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.num && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" value={nums[item.num]} onChange={e => setNums(prev => ({ ...prev, [item.num]: e.target.value }))} onBlur={e => updateNum(item.num, e.target.value)} style={numStyle} />
                  <span style={{ fontSize: 9, color: C.muted }}>{item.unit}</span>
                </div>
              )}
              <Sw on={config[item.k]} onClick={() => toggle(item.k)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Streaks & Engagement</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Streak mechanics, Knowledge Wrapped, gamification, and referrals</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ k: 'streaks', l: 'Streaks' }, { k: 'wrapped', l: 'Knowledge Wrapped' }, { k: 'gamification', l: 'Gamification' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'streaks' && (
        <>
          {renderGroup('Streak Settings', STREAK_CONFIG)}

          {/* Editable streak milestones */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Streak Milestone Days (celebration triggers)</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: C.dim }}>Milestone {n}:</span>
                  <input type="number" value={nums[`milestone_${n}`]} onChange={e => setNums(prev => ({ ...prev, [`milestone_${n}`]: e.target.value }))} onBlur={e => updateNum(`milestone_${n}`, e.target.value)} style={numStyle} />
                  <span style={{ fontSize: 9, color: C.muted }}>days</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Top Streaks</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {topStreaks.length === 0 && (
              <div style={{ padding: '16px 14px', fontSize: 12, color: C.muted, textAlign: 'center' }}>No streak data yet.</div>
            )}
            {topStreaks.map((u, i) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < topStreaks.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, width: 20 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{u.username}</span>
                {u.last_active_at && <span style={{ fontSize: 10, color: C.muted }}>{new Date(u.last_active_at).toLocaleDateString()}</span>}
                <span style={{ fontSize: 14, fontWeight: 700, color: C.warn }}>{u.streak_current || 0}d</span>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'wrapped' && renderGroup('Knowledge Wrapped', WRAPPED_CONFIG)}
      {tab === 'gamification' && (
        <>
          {renderGroup('Gamification & Profile Features', GAMIFICATION_CONFIG)}

          {/* Reading milestone percentages */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reading Milestone Percentages (encouragement triggers)</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: C.dim }}>Point {n}:</span>
                  <input type="number" value={nums[`reading_pct_${n}`]} onChange={e => setNums(prev => ({ ...prev, [`reading_pct_${n}`]: e.target.value }))} onBlur={e => updateNum(`reading_pct_${n}`, e.target.value)} style={numStyle} />
                  <span style={{ fontSize: 9, color: C.muted }}>%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
