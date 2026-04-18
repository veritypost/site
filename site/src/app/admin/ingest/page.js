'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

export default function IngestAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState([]);
  const [filter, setFilter] = useState('all');

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
        .from('story_clusters')
        .select('id, topic, category, subcategory, audience, article_ids, confidence, story_id, created_at')
        .order('created_at', { ascending: false });

      if (data) setClusters(data);
      setLoading(false);
    };
    init();
  }, []);

  // Normalise field names (source: public.story_clusters)
  const normCluster = (c) => ({
    ...c,
    topic: c.topic ?? '',
    sources: Array.isArray(c.article_ids) ? c.article_ids : [],
    articleCount: Array.isArray(c.article_ids) ? c.article_ids.length : 0,
    confidence: c.confidence ?? 'medium',
    category: c.category ?? '',
    freshness: c.created_at ? relativeTime(c.created_at) : '',
    drafted: !!c.story_id,
  });

  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const filtered = clusters.map(normCluster).filter(c => {
    if (filter === 'ready') return !c.drafted && c.confidence !== 'low';
    if (filter === 'drafted') return c.drafted;
    if (filter === 'low') return c.confidence === 'low';
    return true;
  });

  const toggleCheck = (id) => setChecked(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const selectAll = () => setChecked(filtered.filter(c => !c.drafted).map(c => c.id));

  const draftChecked = async () => {
    // Drafting a cluster = running the AI pipeline to produce a Story row
    // and setting story_clusters.story_id. That endpoint is not wired yet.
    // Flipping a boolean here would be dishonest about state, so we stop short.
    alert('Drafting pipeline not yet wired. A backend job needs to create an article from the selected clusters and set story_clusters.story_id.');
    setChecked([]);
  };

  const confColor = { high: C.success, medium: C.warn, low: C.danger };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  const displayClusters = clusters.map(normCluster);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 900, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Source Ingest</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Incoming article clusters from RSS feeds, ready for AI drafting</p>
        </div>
        {checked.length > 0 && (
          <button onClick={draftChecked} style={{ padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, background: C.accent, color: '#fff', cursor: 'pointer' }}>
            Draft {checked.length} Cluster{checked.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Clusters', value: displayClusters.length },
          { label: 'Ready to Draft', value: displayClusters.filter(c => !c.drafted && c.confidence !== 'low').length, color: C.accent },
          { label: 'Already Drafted', value: displayClusters.filter(c => c.drafted).length, color: C.success },
          { label: 'Low Confidence', value: displayClusters.filter(c => c.confidence === 'low').length, color: C.warn },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, alignItems: 'center' }}>
        {[{ k: 'all', l: 'All' }, { k: 'ready', l: 'Ready' }, { k: 'drafted', l: 'Drafted' }, { k: 'low', l: 'Low Confidence' }].map(f => (
          <button key={f.k} onClick={() => { setFilter(f.k); setChecked([]); }} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: filter === f.k ? 700 : 500,
            background: filter === f.k ? C.white : C.card, color: filter === f.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{f.l}</button>
        ))}
        <button onClick={selectAll} style={{ marginLeft: 'auto', fontSize: 10, padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'none', color: C.dim, cursor: 'pointer' }}>Select All Undrafted</button>
      </div>

      {/* Clusters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(cluster => (
          <div key={cluster.id} style={{ background: C.card, border: `1px solid ${checked.includes(cluster.id) ? C.accent + '66' : C.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {!cluster.drafted && (
                <input type="checkbox" checked={checked.includes(cluster.id)} onChange={() => toggleCheck(cluster.id)}
                  style={{ marginTop: 3, accentColor: C.accent }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{cluster.topic}</span>
                  {cluster.drafted && <span style={{ fontSize: 9, fontWeight: 600, color: C.success, padding: '2px 6px', borderRadius: 3, background: C.success + '18' }}>Drafted</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.dim, flexWrap: 'wrap' }}>
                  <span style={{ color: confColor[cluster.confidence] ?? C.dim, fontWeight: 600 }}>{cluster.confidence} confidence</span>
                  <span>{cluster.category}</span>
                  <span>{cluster.articleCount} articles</span>
                  <span>{cluster.freshness}</span>
                </div>
                {cluster.sources.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {cluster.sources.map(s => (
                      <span key={s} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.bg, border: `1px solid ${C.border}`, color: C.muted }}>{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No clusters found.</div>
        )}
      </div>

      <div style={{ marginTop: 20, padding: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, color: C.dim }}>
        Clusters are grouped by topic from incoming RSS articles. High confidence = 3+ sources agree. Low confidence = single source or conflicting claims. Drafting sends the cluster through the full AI pipeline.
      </div>
    </div>
  );
}
