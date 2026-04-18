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

// Static config definitions (display only — toggles saved to Supabase settings)
const PUSH_CONFIG = [
  { k: 'push_breaking', l: 'Breaking news alerts', desc: 'Push notification for breaking articles' },
  { k: 'push_streak_reminder', l: 'Streak reminders', desc: 'Alert users about to lose their streak' },
  { k: 'push_achievement', l: 'Achievement unlocked', desc: 'Notify when user unlocks achievement' },
  { k: 'push_reply', l: 'Reply notifications', desc: 'Notify when someone replies to your comment' },
  { k: 'push_upvote_milestone', l: 'Upvote milestones', desc: 'Notify at milestone upvote counts on a comment' },
  { k: 'push_context_pinned', l: 'Your comment pinned as Article Context (D15)', desc: 'Notify when your comment is organically pinned' },
];

const COALESCING_CONFIG = [
  { k: 'coalesce_enabled', l: 'Notification coalescing', desc: 'Bundle multiple notifications into one within a time window' },
  { k: 'coalesce_upvotes', l: 'Coalesce upvotes', desc: 'Bundle "X people upvoted your comment" instead of individual notifications' },
  { k: 'coalesce_replies', l: 'Coalesce replies', desc: 'Bundle "X people replied to your comment" within window' },
  { k: 'coalesce_achievements', l: 'Coalesce achievements', desc: 'Bundle multiple achievements unlocked in same session' },
];

const EMAIL_CONFIG = [
  { k: 'email_onboarding', l: 'Onboarding sequence', desc: 'Email series for new signups', num: 'onboard_emails', unit: 'emails' },
  { k: 'email_reengagement', l: 'Re-engagement emails', desc: 'Win back inactive users after N days', num: 'reengage_day', unit: 'days' },
  { k: 'email_weekly_reading_report', l: 'Weekly reading report (D25)', desc: 'Per-user stats: reads, quizzes, score, streak' },
  { k: 'email_weekly_family_report', l: 'Weekly family report (D24)', desc: 'Family-tier aggregate email' },
  { k: 'email_breaking', l: 'Breaking news email', desc: 'Email in addition to push for breaking articles' },
  { k: 'email_achievement', l: 'Achievement emails', desc: 'Email summary of achievements earned' },
];

const EMAIL_SEQUENCES = [
  { name: 'Onboarding', status: 'active', emails: [
    { day: 0, subject: 'Welcome to Verity Post', desc: 'Account setup, how VP works, first quiz encouragement' },
    { day: 1, subject: 'Your first daily briefing', desc: 'Top articles, how to use the timeline' },
    { day: 3, subject: 'Understanding Verity Score', desc: 'How scoring works, tiers, earning achievements' },
    { day: 5, subject: 'Join the discussion', desc: 'How comments work, quiz gate explained, community culture' },
    { day: 7, subject: "You're building a streak", desc: 'Streak status, reading stats so far, encouragement' },
  ]},
  { name: 'Re-engagement', status: 'active', emails: [
    { day: 30, subject: 'We miss you', desc: 'What you missed, top articles, streak recovery offer' },
    { day: 37, subject: 'Your reading streak could restart', desc: 'Come back and pick up where you left off' },
  ]},
];

const DEFAULT_TOGGLE_STATE = {
  push_breaking: true, push_streak_reminder: true, push_achievement: true,
  push_reply: true, push_upvote_milestone: false, push_context_pinned: true,
  coalesce_enabled: true, coalesce_upvotes: true,
  coalesce_replies: true, coalesce_achievements: false,
  email_onboarding: true, email_reengagement: true,
  email_weekly_reading_report: true, email_weekly_family_report: true,
  email_breaking: false, email_achievement: false,
};

const DEFAULT_NUMS = {
  upvote_m1: 10, upvote_m2: 25, upvote_m3: 50, upvote_m4: 100,
  coalesce_window: 5,
  onboard_emails: 5, reengage_day: 30, digest_hour: 7,
  digest_stories: 5,
};

export default function NotificationsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('push');

  // Config toggles (loaded from Supabase settings)
  const [config, setConfig] = useState(DEFAULT_TOGGLE_STATE);
  const [nums, setNums] = useState(DEFAULT_NUMS);

  // Sent notifications log
  const [notifications, setNotifications] = useState([]);

  // Compose notification state
  const [compRecipient, setCompRecipient] = useState('all');
  const [compUsername, setCompUsername] = useState('');
  const [compTitle, setCompTitle] = useState('');
  const [compBody, setCompBody] = useState('');
  const [compType, setCompType] = useState('system');
  const [compSending, setCompSending] = useState(false);
  const [compMsg, setCompMsg] = useState('');

  useEffect(() => {
    async function init() {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      // Role check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) {
        router.push('/');
        return;
      }

      // Load notification config from settings table
      const { data: settingsData } = await supabase
        .from('settings')
        .select('*');

      const settingsMap = {};
      (settingsData || []).forEach(s => { settingsMap[s.key] = s.value; });

      // Apply DB values over defaults
      const loadedConfig = { ...DEFAULT_TOGGLE_STATE };
      const loadedNums = { ...DEFAULT_NUMS };

      Object.keys(DEFAULT_TOGGLE_STATE).forEach(k => {
        if (settingsMap[k] !== undefined) {
          loadedConfig[k] = settingsMap[k] === 'true' || settingsMap[k] === true;
        }
      });
      Object.keys(DEFAULT_NUMS).forEach(k => {
        if (settingsMap[k] !== undefined) {
          loadedNums[k] = parseInt(settingsMap[k]) || DEFAULT_NUMS[k];
        }
      });

      setConfig(loadedConfig);
      setNums(loadedNums);

      // Load sent notifications log
      const { data: notifs } = await supabase
        .from('notifications')
        .select('*, users!fk_notifications_user_id(username)')
        .order('created_at', { ascending: false })
        .limit(100);

      setNotifications(notifs || []);

      setLoading(false);
    }
    init();
  }, []);

  const saveSetting = async (key, value) => {
    await supabase
      .from('settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
  };

  const toggle = async (k) => {
    const newVal = !config[k];
    setConfig(prev => ({ ...prev, [k]: newVal }));
    await saveSetting(k, newVal);
  };

  const updateNum = async (k, v) => {
    const val = parseInt(v) || 0;
    setNums(prev => ({ ...prev, [k]: val }));
    await saveSetting(k, val);
  };

  const sendNotification = async () => {
    if (!compTitle.trim() || !compBody.trim()) {
      setCompMsg('Title and body are required');
      return;
    }
    setCompSending(true);
    setCompMsg('');
    try {
      let targetUserIds = [];
      if (compRecipient === 'all') {
        const { data: allUsers } = await supabase
          .from('users')
          .select('id');
        targetUserIds = (allUsers || []).map(u => u.id);
      } else {
        const { data: foundUser } = await supabase
          .from('users')
          .select('id')
          .eq('username', compUsername.trim())
          .single();
        if (!foundUser) {
          setCompMsg('User not found');
          setCompSending(false);
          return;
        }
        targetUserIds = [foundUser.id];
      }

      if (targetUserIds.length === 0) {
        setCompMsg('No users found');
        setCompSending(false);
        return;
      }

      const rows = targetUserIds.map(uid => ({
        user_id: uid,
        title: compTitle.trim(),
        body: compBody.trim(),
        type: compType,
      }));

      const { error } = await supabase.from('notifications').insert(rows);
      if (error) {
        setCompMsg('Error: ' + error.message);
      } else {
        setCompMsg(`Sent to ${targetUserIds.length} user${targetUserIds.length > 1 ? 's' : ''}`);
        setCompTitle('');
        setCompBody('');
        setCompUsername('');
        // Refresh log
        const { data: notifs } = await supabase
          .from('notifications')
          .select('*, users!fk_notifications_user_id(username)')
          .order('created_at', { ascending: false })
          .limit(100);
        setNotifications(notifs || []);
      }
    } catch (err) {
      setCompMsg('Error sending notification');
    }
    setCompSending(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  const typeColor = (type) => {
    if (type === 'breaking') return C.danger;
    if (type === 'achievement' || type === 'milestone') return C.success;
    if (type === 'streak') return C.warn;
    return C.accent;
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Notifications & Email</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Push notifications, email sequences, and digest configuration</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ k: 'push', l: 'Push Notifications' }, { k: 'coalescing', l: 'Coalescing' }, { k: 'email', l: 'Email Config' }, { k: 'sequences', l: 'Email Sequences' }, { k: 'log', l: `Log (${notifications.length})` }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'push' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            {PUSH_CONFIG.map((item, i) => (
              <div key={item.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i === PUSH_CONFIG.length - 1 ? 'none' : `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
                </div>
                <Sw on={!!config[item.k]} onClick={() => toggle(item.k)} />
              </div>
            ))}
          </div>

          {/* Editable upvote milestone thresholds */}
          <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Upvote Milestone Thresholds</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: C.dim }}>M{n}:</span>
                <input type="number" value={nums[`upvote_m${n}`]}
                  onChange={e => setNums(prev => ({ ...prev, [`upvote_m${n}`]: e.target.value }))}
                  onBlur={e => updateNum(`upvote_m${n}`, e.target.value)}
                  style={numStyle} />
                <span style={{ fontSize: 9, color: C.muted }}>upvotes</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'coalescing' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.accent}22`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 11, color: C.dim }}>
            Coalescing bundles rapid-fire notifications into a single summary. For example, 10 upvotes in 5 minutes becomes "10 people upvoted your comment" instead of 10 separate alerts.
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Coalescing Window</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" value={nums.coalesce_window}
                onChange={e => setNums(prev => ({ ...prev, coalesce_window: e.target.value }))}
                onBlur={e => updateNum('coalesce_window', e.target.value)}
                style={{ ...numStyle, width: 60 }} />
              <span style={{ fontSize: 11, color: C.dim }}>minutes</span>
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {COALESCING_CONFIG.map((item, i) => (
              <div key={item.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i === COALESCING_CONFIG.length - 1 ? 'none' : `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
                </div>
                <Sw on={!!config[item.k]} onClick={() => toggle(item.k)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {EMAIL_CONFIG.map((item, i) => (
            <div key={item.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i === EMAIL_CONFIG.length - 1 ? 'none' : `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.num && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" value={nums[item.num]}
                      onChange={e => setNums(prev => ({ ...prev, [item.num]: e.target.value }))}
                      onBlur={e => updateNum(item.num, e.target.value)}
                      style={numStyle} />
                    <span style={{ fontSize: 9, color: C.muted }}>{item.unit}</span>
                  </div>
                )}
                <Sw on={!!config[item.k]} onClick={() => toggle(item.k)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sequences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {EMAIL_SEQUENCES.map(seq => (
            <div key={seq.name} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{seq.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{seq.emails.length} email{seq.emails.length > 1 ? 's' : ''}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: seq.status === 'active' ? C.success + '18' : C.muted + '18', color: seq.status === 'active' ? C.success : C.muted }}>{seq.status}</span>
              </div>
              {seq.emails.map((email, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ width: 40, fontSize: 10, color: C.dim, fontWeight: 600, flexShrink: 0 }}>
                    {email.day !== null ? `Day ${email.day}` : 'Daily'}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{email.subject}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{email.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div>
          {/* Send Notification compose */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Send Notification</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={compRecipient}
                onChange={e => setCompRecipient(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none' }}
              >
                <option value="all">All users</option>
                <option value="specific">Specific user</option>
              </select>
              {compRecipient === 'specific' && (
                <input
                  value={compUsername}
                  onChange={e => setCompUsername(e.target.value)}
                  placeholder="Username"
                  style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none', width: 140 }}
                />
              )}
              <select
                value={compType}
                onChange={e => setCompType(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none' }}
              >
                <option value="system">System</option>
                <option value="breaking">Breaking</option>
                <option value="achievement">Achievement</option>
                <option value="streak">Streak</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
            <input
              value={compTitle}
              onChange={e => setCompTitle(e.target.value)}
              placeholder="Notification title"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
            />
            <textarea
              value={compBody}
              onChange={e => setCompBody(e.target.value)}
              placeholder="Notification body"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={sendNotification}
                disabled={compSending}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {compSending ? 'Sending...' : 'Send Notification'}
              </button>
              {compMsg && <span style={{ fontSize: 12, color: compMsg.startsWith('Error') ? C.danger : C.success, fontWeight: 600 }}>{compMsg}</span>}
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.2fr 0.8fr 1.2fr', gap: 8, padding: '7px 14px', borderBottom: `1px solid ${C.border}`, background: '#0d0d10' }}>
              {['User', 'Message', 'Type', 'Read', 'Sent'].map(h => (
                <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 14px', fontSize: 12, color: C.muted, textAlign: 'center' }}>No notifications sent yet</div>
            ) : notifications.map((n, i) => (
              <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.2fr 0.8fr 1.2fr', gap: 8, padding: '9px 14px', borderBottom: i < notifications.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.white }}>{n.users?.username || n.user_id}</div>
                <div style={{ fontSize: 11, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body || n.title || '—'}</div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: typeColor(n.type) + '18', color: typeColor(n.type) }}>{n.type || 'system'}</span>
                </div>
                <div style={{ fontSize: 11, color: n.read_at ? C.success : C.muted }}>{n.read_at ? 'Read' : 'Unread'}</div>
                <div style={{ fontSize: 10, color: C.dim }}>{n.created_at ? new Date(n.created_at).toLocaleString() : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
