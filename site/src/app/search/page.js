'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { isPaidTier } from '@/lib/tiers';
import { assertNotKidMode } from '@/lib/guards';

// D26: basic keyword search for everyone; advanced filters (date,
// category, subcategory, source) at Verity+. The server ignores
// filters from free users regardless, so the UI just hides them.

export default function SearchPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userTier, setUserTier] = useState('free');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [source, setSource] = useState('');
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('basic');

  const isPaid = isPaidTier(userTier);

  useEffect(() => {
    if (assertNotKidMode(router)) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: u } = await supabase.from('users').select('plans(tier)').eq('id', user.id).maybeSingle();
        setUserTier(u?.plans?.tier || 'free');
      }
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .eq('is_kids_safe', false)
        .is('parent_id', null)
        .order('name');
      setCategories(cats || []);
    })();
  }, []);

  async function runSearch() {
    if (!q.trim()) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({ q: q.trim() });
    if (isPaid) {
      if (category) params.set('category', category);
      if (from)     params.set('from', from);
      if (to)       params.set('to', to);
      if (source)   params.set('source', source);
    }
    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Search failed');
      setResults(data.articles || []);
      setMode(data.mode || 'basic');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 16px' }}>Search</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
          placeholder="Search by keyword"
          aria-label="Search articles"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5', fontSize: 14, outline: 'none' }}
        />
        <button onClick={runSearch} disabled={!q.trim() || loading} style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: q.trim() && !loading ? '#111' : '#ccc', color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: q.trim() && !loading ? 'pointer' : 'default',
        }}>{loading ? 'Searching…' : 'Search'}</button>
      </div>

      {isPaid ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 16 }}>
          <select value={category} onChange={e => setCategory(e.target.value)} style={filterStyle}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={filterStyle} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={filterStyle} />
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source publisher…" style={filterStyle} />
        </div>
      ) : (
        <div style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#666' }}>
          Advanced filters (date range, category, source) are available on paid plans.{' '}
          <a href="/profile/settings/billing" style={{ color: '#111', fontWeight: 700 }}>View plans →</a>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{error}</div>}

      <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
        {results.length > 0 ? `${results.length} result${results.length === 1 ? '' : 's'} · ${mode}` : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map(a => (
          <a key={a.id} href={`/story/${a.slug}`} style={{ display: 'block', background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, padding: 14, textDecoration: 'none', color: '#111' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{a.title}</div>
            {a.excerpt && <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>{a.excerpt}</div>}
            <div style={{ fontSize: 11, color: '#666' }}>
              {a.categories?.name}{a.categories?.name && a.published_at ? ' · ' : ''}{a.published_at ? new Date(a.published_at).toLocaleDateString() : ''}
            </div>
          </a>
        ))}
        {results.length === 0 && !loading && q && (
          <div style={{ padding: 40, textAlign: 'center', color: '#666', fontSize: 13 }}>No matches. Try a different keyword.</div>
        )}
      </div>
    </div>
  );
}

const filterStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', background: '#fff' };
