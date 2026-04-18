'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const NUM_INPUT_STYLE = {
  width: 60, padding: '4px 6px', borderRadius: 4, border: `1px solid ${C.border}`,
  background: C.bg, color: C.white, fontSize: 11, fontWeight: 600, textAlign: 'center', outline: 'none',
};

const FILTER_CATEGORIES = [
  {
    key: 'account', label: 'Account Status',
    filters: [
      { key: 'plan', label: 'Plan', type: 'dropdown', options: ['Any', 'Free', 'Verity', 'Verity Pro', 'Verity Family', 'Verity Family XL'] },
      { key: 'emailVerified', label: 'Email verified', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'hasAvatar', label: 'Has avatar', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'hasBio', label: 'Has bio', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'accountStatus', label: 'Account status', type: 'dropdown', options: ['Any', 'Active', 'Banned', 'Suspended'] },
      { key: 'twoFactorEnabled', label: 'Two-factor enabled', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
    ],
  },
  {
    key: 'signup', label: 'Signup & Tenure',
    filters: [
      { key: 'signedUp', label: 'Signed up', type: 'dropdown', options: ['Any', 'Today', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 365 days', '1yr+'] },
      { key: 'signedUpBetween', label: 'Signed up between', type: 'range', unit: 'days ago', minKey: 'signedUpMin', maxKey: 'signedUpMax' },
      { key: 'referredBy', label: 'Referred by', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
    ],
  },
  {
    key: 'engagement', label: 'Engagement',
    filters: [
      { key: 'articlesRead', label: 'Articles read', type: 'range', minKey: 'articlesReadMin', maxKey: 'articlesReadMax' },
      { key: 'quizzesTaken', label: 'Quizzes taken', type: 'range', minKey: 'quizzesTakenMin', maxKey: 'quizzesTakenMax' },
      { key: 'quizzesPassed', label: 'Quizzes passed', type: 'range', minKey: 'quizzesPassedMin', maxKey: 'quizzesPassedMax' },
      { key: 'quizPassRate', label: 'Quiz pass rate', type: 'range', unit: '%', minKey: 'quizPassRateMin', maxKey: 'quizPassRateMax' },
      { key: 'commentsPosted', label: 'Comments posted', type: 'range', minKey: 'commentsPostedMin', maxKey: 'commentsPostedMax' },
      { key: 'upvotesReceived', label: 'Upvotes received', type: 'range', minKey: 'upvotesReceivedMin', maxKey: 'upvotesReceivedMax' },
      { key: 'lastActive', label: 'Last active', type: 'dropdown', options: ['Any', 'Today', 'Last 7 days', 'Last 14 days', 'Last 30 days', 'Inactive 14+ days', 'Inactive 30+ days', 'Inactive 60+ days', 'Inactive 90+ days'] },
      { key: 'lastActiveBetween', label: 'Last active between', type: 'range', unit: 'days ago', minKey: 'lastActiveMin', maxKey: 'lastActiveMax' },
    ],
  },
  {
    key: 'streaks', label: 'Streaks & Verity Score',
    filters: [
      { key: 'currentStreak', label: 'Current streak', type: 'range', minKey: 'currentStreakMin', maxKey: 'currentStreakMax' },
      { key: 'longestStreak', label: 'Longest streak', type: 'range', minKey: 'longestStreakMin', maxKey: 'longestStreakMax' },
      { key: 'verityTier', label: 'Verity tier', type: 'dropdown', options: ['Any', 'Newcomer', 'Reader', 'Contributor', 'Trusted', 'Distinguished', 'Luminary'] },
      { key: 'vpScore', label: 'VP score', type: 'range', minKey: 'vpScoreMin', maxKey: 'vpScoreMax' },
      { key: 'achievementsEarned', label: 'Achievements earned', type: 'range', minKey: 'achievementsEarnedMin', maxKey: 'achievementsEarnedMax' },
    ],
  },
  {
    key: 'subscription', label: 'Subscription & Revenue',
    filters: [
      { key: 'everUpgraded', label: 'Ever upgraded', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'everDowngraded', label: 'Ever downgraded', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'inGracePeriod', label: 'In grace period', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'subscriptionPaused', label: 'Subscription paused', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'recentlyChurned', label: 'Recently churned', type: 'single', unit: 'days', inputKey: 'recentlyChurnedDays' },
      { key: 'totalRevenue', label: 'Total revenue', type: 'range', prefix: '$', minKey: 'totalRevenueMin', maxKey: 'totalRevenueMax' },
    ],
  },
  {
    key: 'content', label: 'Content Preferences',
    filters: [
      { key: 'favoriteCategory', label: 'Favorite category', type: 'dropdown', options: ['Any', 'Technology', 'Business', 'Science', 'Health', 'World', 'Climate', 'Sports', 'Entertainment', 'Politics'] },
      { key: 'readsKidsContent', label: 'Reads kids content', type: 'dropdown', options: ['Any', 'Yes', 'No', 'Exclusively'] },
      { key: 'hasBookmarks', label: 'Has bookmarks', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'bookmarksCount', label: 'Bookmarks count', type: 'range', minKey: 'bookmarksCountMin', maxKey: 'bookmarksCountMax' },
    ],
  },
  {
    key: 'device', label: 'Device & Platform',
    filters: [
      { key: 'platform', label: 'Platform', type: 'dropdown', options: ['Any', 'iOS', 'Android', 'Web'] },
      { key: 'pushNotifications', label: 'Push notifications enabled', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'emailNotifications', label: 'Email notifications enabled', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
    ],
  },
  {
    key: 'moderation', label: 'Moderation',
    filters: [
      { key: 'hasBeenReported', label: 'Has been reported', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'reportsReceived', label: 'Reports received', type: 'range', minKey: 'reportsReceivedMin', maxKey: 'reportsReceivedMax' },
      { key: 'hasBeenWarned', label: 'Has been warned', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'hasExpertVerification', label: 'Has expert verification', type: 'dropdown', options: ['Any', 'Yes', 'No'] },
      { key: 'verificationType', label: 'Verification type', type: 'dropdown', options: ['Any', 'Journalist', 'Expert', 'Public Figure'] },
    ],
  },
];

function buildDefaultFilters() {
  const f = {};
  FILTER_CATEGORIES.forEach(cat => {
    cat.filters.forEach(filter => {
      if (filter.type === 'dropdown') {
        f[filter.key] = 'Any';
      } else if (filter.type === 'range') {
        f[filter.minKey] = '';
        f[filter.maxKey] = '';
      } else if (filter.type === 'single') {
        f[filter.inputKey] = '';
      }
    });
  });
  return f;
}

const DEFAULT_FILTERS = buildDefaultFilters();

function countActiveInCategory(cat, filters) {
  let count = 0;
  cat.filters.forEach(filter => {
    if (filter.type === 'dropdown' && filters[filter.key] !== 'Any') count++;
    else if (filter.type === 'range' && (filters[filter.minKey] !== '' || filters[filter.maxKey] !== '')) count++;
    else if (filter.type === 'single' && filters[filter.inputKey] !== '') count++;
  });
  return count;
}

function countAllActive(filters) {
  let count = 0;
  FILTER_CATEGORIES.forEach(cat => { count += countActiveInCategory(cat, filters); });
  return count;
}

export default function CohortsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cohorts');
  const [cohorts, setCohorts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [msgType, setMsgType] = useState('email');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [collapsed, setCollapsed] = useState({});

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

      const { data: cohortRows } = await supabase
        .from('cohorts')
        .select('*')
        .order('created_at', { ascending: false });

      setCohorts(cohortRows || []);

      // Load past campaigns — join to cohort for display name.
      const { data: campaignRows } = await supabase
        .from('campaigns')
        .select('id, name, cohort_id, type, channel, subject, body, sent_count, opened_count, clicked_count, conversion_count, completed_at, cohorts ( name )')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(20);

      setCampaigns((campaignRows || []).map(c => ({ ...c, cohort_name: c.cohorts?.name || null })));
      setLoading(false);
    }
    init();
  }, []);

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const activeFilterCount = countAllActive(filters);

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
  };

  const sendMessage = async () => {
    if (!selectedCohort) return;
    const cohort = cohorts.find(c => c.id === selectedCohort);
    if (!cohort) return;
    const { data: inserted, error } = await supabase
      .from('campaigns')
      .insert({
        name: msgSubject || `${cohort.name} · ${new Date().toISOString().slice(0, 10)}`,
        cohort_id: cohort.id,
        type: msgType === 'in-app' ? 'in-app' : msgType,
        channel: msgType === 'in-app' ? 'in-app' : msgType,
        subject: msgSubject || null,
        body: msgBody || null,
        completed_at: new Date().toISOString(),
      })
      .select('id, name, cohort_id, type, channel, subject, body, sent_count, opened_count, clicked_count, conversion_count, completed_at')
      .single();
    if (!error && inserted) {
      setCampaigns(prev => [{ ...inserted, cohort_name: cohort.name }, ...prev]);
      setShowCompose(false);
      setMsgSubject('');
      setMsgBody('');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  const selectStyle = (isActive) => ({
    width: '100%', padding: '7px 8px', borderRadius: 6,
    border: `1px solid ${isActive ? C.accent + '44' : C.border}`,
    background: C.bg, color: C.white, fontSize: 11, outline: 'none',
  });

  const renderFilter = (filter) => {
    if (filter.type === 'dropdown') {
      const isActive = filters[filter.key] !== 'Any';
      return (
        <div key={filter.key} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.dim, marginBottom: 3 }}>{filter.label}</div>
          <select value={filters[filter.key]} onChange={e => updateFilter(filter.key, e.target.value)} style={selectStyle(isActive)}>
            {filter.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }

    if (filter.type === 'range') {
      const minVal = filters[filter.minKey];
      const maxVal = filters[filter.maxKey];
      const isActive = minVal !== '' || maxVal !== '';
      const prefix = filter.prefix || '';
      const unit = filter.unit || '';
      return (
        <div key={filter.key} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.dim, marginBottom: 3 }}>{filter.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.dim }}>Between</span>
            {prefix && <span style={{ fontSize: 10, color: C.soft }}>{prefix}</span>}
            <input type="number" value={minVal} onChange={e => updateFilter(filter.minKey, e.target.value)}
              placeholder="min" style={{ ...NUM_INPUT_STYLE, borderColor: isActive ? C.accent + '44' : C.border }} />
            <span style={{ fontSize: 10, color: C.dim }}>and</span>
            {prefix && <span style={{ fontSize: 10, color: C.soft }}>{prefix}</span>}
            <input type="number" value={maxVal} onChange={e => updateFilter(filter.maxKey, e.target.value)}
              placeholder="max" style={{ ...NUM_INPUT_STYLE, borderColor: isActive ? C.accent + '44' : C.border }} />
            {unit && <span style={{ fontSize: 10, color: C.dim }}>{unit}</span>}
          </div>
        </div>
      );
    }

    if (filter.type === 'single') {
      const val = filters[filter.inputKey];
      const isActive = val !== '';
      const unit = filter.unit || '';
      return (
        <div key={filter.key} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.dim, marginBottom: 3 }}>{filter.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.dim }}>Cancelled within last</span>
            <input type="number" value={val} onChange={e => updateFilter(filter.inputKey, e.target.value)}
              placeholder="--" style={{ ...NUM_INPUT_STYLE, borderColor: isActive ? C.accent + '44' : C.border }} />
            {unit && <span style={{ fontSize: 10, color: C.dim }}>{unit}</span>}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 950, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 24, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>User Cohorts & Messaging</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Segment users by behavior, send targeted emails or push notifications</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ k: 'cohorts', l: 'Cohorts' }, { k: 'builder', l: 'Custom Builder' }, { k: 'campaigns', l: 'Past Campaigns' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'cohorts' && (
        <>
          {cohorts.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              No cohorts yet. Save one from the Custom Builder tab.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cohorts.map(cohort => (
              <div key={cohort.id} onClick={() => { setSelectedCohort(cohort.id); setShowCompose(false); }} style={{
                background: C.card, border: `1px solid ${selectedCohort === cohort.id ? C.accent + '66' : C.border}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{cohort.name}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{cohort.desc || cohort.description}</div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 50 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{cohort.count ?? '—'}</div>
                  <div style={{ fontSize: 9, color: C.dim }}>users</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setSelectedCohort(cohort.id); setShowCompose(true); }} style={{
                  padding: '7px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>Message</button>
              </div>
            ))}
          </div>

          {/* Compose panel */}
          {showCompose && selectedCohort && (
            <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.accent}33`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                Send to: {cohorts.find(c => c.id === selectedCohort)?.name}
                {cohorts.find(c => c.id === selectedCohort)?.count != null && ` (${cohorts.find(c => c.id === selectedCohort).count} users)`}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {['email', 'push', 'in-app'].map(t => (
                  <button key={t} onClick={() => setMsgType(t)} style={{
                    padding: '5px 12px', borderRadius: 5, border: 'none', fontSize: 11, fontWeight: msgType === t ? 700 : 500,
                    background: msgType === t ? C.white : C.bg, color: msgType === t ? C.bg : C.dim, cursor: 'pointer',
                  }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
              {msgType === 'email' && (
                <input value={msgSubject} onChange={e => setMsgSubject(e.target.value)} placeholder="Subject line..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none', marginBottom: 8 }} />
              )}
              <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} placeholder="Message body..." rows={4}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none', resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={sendMessage} disabled={!msgBody.trim()} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: msgBody.trim() ? C.success : C.muted, color: '#fff', fontSize: 12, fontWeight: 700, cursor: msgBody.trim() ? 'pointer' : 'default' }}>Send</button>
                <button onClick={() => setShowCompose(false)} style={{ padding: '8px 20px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'builder' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Build Custom Cohort</div>
              <div style={{ fontSize: 11, color: activeFilterCount > 0 ? C.accent : C.dim, fontWeight: 600 }}>
                {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active` : 'No filters'}
              </div>
            </div>

            {/* Collapsible filter sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {FILTER_CATEGORIES.map(cat => {
                const isOpen = !collapsed[cat.key];
                const catActiveCount = countActiveInCategory(cat, filters);
                return (
                  <div key={cat.key} style={{ border: `1px solid ${catActiveCount > 0 ? C.accent + '33' : C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    {/* Section header */}
                    <button onClick={() => toggleSection(cat.key)} style={{
                      width: '100%', padding: '10px 14px', background: catActiveCount > 0 ? C.accent + '08' : C.bg, border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: C.dim, width: 'auto' }}>{isOpen ? 'Hide' : 'Show'}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{cat.label}</span>
                        {catActiveCount > 0 && (
                          <span style={{
                            background: C.accent, color: '#fff', fontSize: 9, fontWeight: 800,
                            borderRadius: 10, padding: '2px 7px', lineHeight: '14px',
                          }}>{catActiveCount}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: C.dim }}>{cat.filters.length} filters</span>
                    </button>

                    {/* Section body */}
                    {isOpen && (
                      <div style={{ padding: '12px 14px 8px', background: C.bg + 'cc' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 16px' }}>
                          {cat.filters.map(filter => renderFilter(filter))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, color: C.dim }}>
                {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active` : 'No filters -- showing all users'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={resetFilters} style={{ padding: '6px 12px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 10, cursor: 'pointer' }}>Reset All</button>
              </div>
            </div>
          </div>
          <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 12 }}>Build filters above, then run query to see matching users. From results, you can message the cohort directly.</div>
        </div>
      )}

      {tab === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>No campaigns sent yet.</div>
          )}
          {campaigns.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name || c.subject || 'Campaign'}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{c.cohort_name} | {c.channel || c.type} | {c.completed_at ? new Date(c.completed_at).toLocaleDateString() : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                {[
                  { label: 'Sent', value: c.sent_count || '—', color: C.white },
                  { label: 'Opened', value: c.opened_count || '—', color: C.accent },
                  { label: 'Clicked', value: c.clicked_count || '—', color: C.warn },
                  { label: 'Converted', value: c.conversion_count || '—', color: C.success },
                  ...(c.sent_count && c.opened_count ? [{ label: 'Open Rate', value: `${Math.round(c.opened_count / c.sent_count * 100)}%`, color: C.dim }] : []),
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: C.dim }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
