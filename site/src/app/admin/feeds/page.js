'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const STATUS_CONFIG = { ok: { color: '#22c55e', label: 'OK' }, stale: { color: '#f59e0b', label: 'Stale' }, broken: { color: '#ef4444', label: 'Broken' } };

const numStyle = { width: 50, padding: '4px 6px', borderRadius: 4, border: '1px solid #222222', background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

export default function FeedsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newOutlet, setNewOutlet] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('feeds');
  const [staleHours, setStaleHours] = useState(6);
  const [brokenFailCount, setBrokenFailCount] = useState(10);
  const [pullIntervalMin, setPullIntervalMin] = useState(30);

  useEffect(() => {
    const init = async () => {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Admin check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name?.toLowerCase()).filter(Boolean);
      if (!profile || !roleNames.some((r) => r === 'owner' || r === 'admin')) {
        router.push('/');
        return;
      }

      const { data } = await supabase
        .from('rss_feeds')
        .select('*')
        .order('outlet');

      if (data) setFeeds(data);
      setLoading(false);
    };
    init();
  }, []);

  // Normalise field names
  const normFeed = (f) => ({
    ...f,
    outlet: f.outlet ?? f.name ?? f.source_name ?? '',
    url: f.url ?? f.feed_url ?? f.rss_url ?? '',
    status: f.status ?? 'ok',
    lastPull: (f.last_pull ?? f.last_fetched ?? f.last_pulled ?? f.updated_at ?? '').replace('T', ' ').slice(0, 16) || 'Never',
    articles: f.articles ?? f.article_count ?? f.total_articles ?? 0,
    active: f.active ?? f.enabled ?? true,
    failCount: f.fail_count ?? f.failure_count ?? f.failCount ?? 0,
    avgArticlesPerDay: f.avg_articles_per_day ?? f.avgArticlesPerDay ?? 0,
    staleSince: f.stale_since ?? f.staleSince ?? null,
  });

  const displayFeeds = feeds.map(normFeed);

  const filtered = displayFeeds.filter(f => {
    if (filter === 'ok') return f.status === 'ok';
    if (filter === 'issues') return f.status !== 'ok';
    return true;
  });

  const toggleFeed = async (id) => {
    const feed = feeds.find(f => f.id === id);
    if (!feed) return;
    const norm = normFeed(feed);
    const { error } = await supabase
      .from('rss_feeds')
      .update({ active: !norm.active })
      .eq('id', id);
    if (!error) {
      setFeeds(prev => prev.map(f => f.id === id ? { ...f, active: !normFeed(f).active } : f));
    }
  };

  const removeFeed = async (id) => {
    const { error } = await supabase.from('rss_feeds').delete().eq('id', id);
    if (!error) setFeeds(prev => prev.filter(f => f.id !== id));
  };

  const rePull = async (id) => {
    const { error } = await supabase
      .from('rss_feeds')
      .update({ status: 'ok', fail_count: 0, stale_since: null, last_pull: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setFeeds(prev => prev.map(f => f.id === id ? { ...f, status: 'ok', fail_count: 0, stale_since: null, last_pull: new Date().toISOString() } : f));
    }
  };

  const addFeed = async () => {
    if (!newOutlet.trim() || !newUrl.trim()) return;
    const newEntry = {
      name: newOutlet.trim(),
      outlet: newOutlet.trim(),
      url: newUrl.trim(),
      status: 'ok',
      active: true,
      fail_count: 0,
    };
    const { data, error } = await supabase
      .from('rss_feeds')
      .insert(newEntry)
      .select()
      .single();
    if (!error && data) {
      setFeeds(prev => [...prev, data]);
    }
    setNewOutlet('');
    setNewUrl('');
    setShowAdd(false);
  };

  const okCount = displayFeeds.filter(f => f.status === 'ok').length;
  const issueCount = displayFeeds.filter(f => f.status !== 'ok').length;
  const totalArticles = displayFeeds.reduce((a, f) => a + f.articles, 0);
  const totalFails = displayFeeds.reduce((a, f) => a + f.failCount, 0);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>RSS Feeds</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Manage news source feeds, health monitoring, and article volume</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: showAdd ? C.danger : C.white, color: showAdd ? '#fff' : C.bg, cursor: 'pointer',
        }}>
          {showAdd ? 'Cancel' : '+ Add Feed'}
        </button>
      </div>

      {/* Feed health thresholds */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.warn }}>Stale after:</span>
          <input type="number" value={staleHours} onChange={e => setStaleHours(parseInt(e.target.value) || 0)} style={numStyle} />
          <span style={{ fontSize: 9, color: C.muted }}>hours</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.danger }}>Broken after:</span>
          <input type="number" value={brokenFailCount} onChange={e => setBrokenFailCount(parseInt(e.target.value) || 0)} style={numStyle} />
          <span style={{ fontSize: 9, color: C.muted }}>failures</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.dim }}>Pull interval:</span>
          <input type="number" value={pullIntervalMin} onChange={e => setPullIntervalMin(parseInt(e.target.value) || 0)} style={numStyle} />
          <span style={{ fontSize: 9, color: C.muted }}>min</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Feeds', value: displayFeeds.length },
          { label: 'Healthy', value: okCount, color: C.success },
          { label: 'Issues', value: issueCount, color: issueCount > 0 ? C.danger : C.success },
          { label: 'Articles Pulled', value: totalArticles },
          { label: 'Total Failures', value: totalFails, color: totalFails > 0 ? C.warn : C.success },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Outlet Name</label>
            <input value={newOutlet} onChange={e => setNewOutlet(e.target.value)} placeholder="e.g. Reuters"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none' }} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 10, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>RSS URL</label>
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none' }} />
          </div>
          <button onClick={addFeed} disabled={!newOutlet.trim() || !newUrl.trim()} style={{
            padding: '8px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
            background: newOutlet.trim() && newUrl.trim() ? C.accent : C.muted, color: '#fff', cursor: newOutlet.trim() && newUrl.trim() ? 'pointer' : 'default',
          }}>Add</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[{ k: 'feeds', l: 'All Feeds' }, { k: 'health', l: 'Health Monitor' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '7px 16px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'feeds' && (
        <>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {['all', 'ok', 'issues'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: filter === f ? 700 : 500,
                background: filter === f ? C.white : C.card, color: filter === f ? C.bg : C.dim, cursor: 'pointer',
              }}>
                {f === 'ok' ? 'Healthy' : f === 'issues' ? 'Issues' : 'All'}
              </button>
            ))}
          </div>

          {/* Feed list */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {filtered.map(feed => {
              const sc = STATUS_CONFIG[feed.status] ?? STATUS_CONFIG.ok;
              return (
                <div key={feed.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: feed.active ? C.white : C.muted }}>{feed.outlet}</div>
                    <div style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.url}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: sc.color, padding: '2px 6px', borderRadius: 3, background: sc.color + '18' }}>{sc.label}</span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 60 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{feed.articles}</div>
                    <div style={{ fontSize: 9, color: C.muted }}>articles</div>
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, flexShrink: 0, minWidth: 90, textAlign: 'right' }}>{feed.lastPull}</div>
                  <button onClick={() => toggleFeed(feed.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: feed.active ? C.success : '#333', position: 'relative', transition: 'background 0.15s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: feed.active ? '#fff' : '#666', position: 'absolute', top: 2, left: feed.active ? 18 : 2, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
                    </div>
                  </button>
                  {feed.status !== 'ok' && (
                    <button onClick={() => rePull(feed.id)} style={{ fontSize: 9, padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.accent}44`, background: 'none', color: C.accent, cursor: 'pointer', fontWeight: 600 }}>Re-pull</button>
                  )}
                  <button onClick={() => removeFeed(feed.id)} style={{ fontSize: 9, padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, cursor: 'pointer', fontWeight: 600 }}>Del</button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No feeds found.</div>
            )}
          </div>
        </>
      )}

      {tab === 'health' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 11, color: C.dim }}>
            Feed health dashboard — monitors failure counts, staleness, and article volume. Stale feeds haven't pulled in {staleHours}+ hours. Broken feeds have {brokenFailCount}+ consecutive failures.
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 9, fontWeight: 700, color: C.dim, textTransform: 'uppercase' }}>
              <div style={{ flex: 1 }}>Source</div>
              <div style={{ width: 60, textAlign: 'center' }}>Status</div>
              <div style={{ width: 60, textAlign: 'center' }}>Failures</div>
              <div style={{ width: 60, textAlign: 'center' }}>Avg/Day</div>
              <div style={{ width: 100, textAlign: 'center' }}>Stale Since</div>
              <div style={{ width: 60 }}></div>
            </div>
            {displayFeeds.map(feed => {
              const sc = STATUS_CONFIG[feed.status] ?? STATUS_CONFIG.ok;
              return (
                <div key={feed.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: feed.active ? C.white : C.muted }}>{feed.outlet}</div>
                  </div>
                  <div style={{ width: 60, textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: sc.color, padding: '2px 6px', borderRadius: 3, background: sc.color + '18' }}>{sc.label}</span>
                  </div>
                  <div style={{ width: 60, textAlign: 'center', fontSize: 14, fontWeight: 700, color: feed.failCount > 5 ? C.danger : feed.failCount > 0 ? C.warn : C.success }}>
                    {feed.failCount}
                  </div>
                  <div style={{ width: 60, textAlign: 'center', fontSize: 13, fontWeight: 600, color: feed.avgArticlesPerDay === 0 ? C.muted : C.white }}>
                    {feed.avgArticlesPerDay}
                  </div>
                  <div style={{ width: 100, textAlign: 'center', fontSize: 10, color: feed.staleSince ? C.warn : C.muted }}>
                    {feed.staleSince || '---'}
                  </div>
                  <div style={{ width: 60 }}>
                    {feed.status !== 'ok' && (
                      <button onClick={() => rePull(feed.id)} style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: 'none', background: C.accent, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Re-pull</button>
                    )}
                  </div>
                </div>
              );
            })}
            {displayFeeds.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No feeds found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
