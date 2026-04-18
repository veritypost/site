'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { isPaidTier } from '@/lib/tiers';
import { assertNotKidMode } from '@/lib/guards';
import ConfirmDialog from '@/components/ConfirmDialog';

// D13: free = 10-cap flat list, Verity+ = unlimited + collections + notes + export.
const FREE_BOOKMARK_CAP = 10;

// Same strip-the-Kids-tag rule used across the site.
function stripKidsTag(name) {
  if (!name) return '';
  return String(name)
    .replace(/\s*\(kids?\)\s*$/i, '')
    .replace(/\s+kids?\s*$/i, '')
    .replace(/^kids?\s+/i, '')
    .trim();
}

export default function BookmarksPage() {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState([]);
  const [collections, setCollections] = useState([]);
  const [activeCollection, setActiveCollection] = useState('all');   // 'all' | 'uncategorised' | collection_id
  const [userTier, setUserTier] = useState('free');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingNotes, setEditingNotes] = useState(null);            // bookmark id
  const [noteDraft, setNoteDraft] = useState('');

  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name }
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isPaid = isPaidTier(userTier);
  const atCap = !isPaid && items.length >= FREE_BOOKMARK_CAP;

  async function load() {
    if (assertNotKidMode(router)) return;
    setLoading(true); setError('');
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }

    const { data: userRow } = await supabase
      .from('users').select('plans(tier)').eq('id', authUser.id).maybeSingle();
    const tier = userRow?.plans?.tier || 'free';
    setUserTier(tier);

    const { data: bms } = await supabase
      .from('bookmarks')
      .select('id, notes, created_at, collection_id, articles(id, title, slug, excerpt, published_at, categories(name))')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false });
    setItems(bms || []);

    if (isPaidTier(tier)) {
      const { data: cols } = await supabase
        .from('bookmark_collections')
        .select('id, name, bookmark_count')
        .eq('user_id', authUser.id)
        .order('sort_order').order('created_at');
      setCollections(cols || []);
    } else {
      setCollections([]);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function removeBookmark(id) {
    const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Remove failed'); return; }
    setItems(prev => prev.filter(b => b.id !== id));
  }

  async function saveNotes(id) {
    const res = await fetch(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: noteDraft }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Save failed'); return; }
    setItems(prev => prev.map(b => b.id === id ? { ...b, notes: noteDraft } : b));
    setEditingNotes(null); setNoteDraft('');
  }

  async function moveToCollection(id, collectionId) {
    const res = await fetch(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection_id: collectionId }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Move failed'); return; }
    await load();
  }

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    const res = await fetch('/api/bookmark-collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Create failed'); return; }
    setNewCollectionName(''); setShowNewCollection(false);
    load();
  }

  function requestDeleteCollection(col) {
    setPendingDelete({ id: col.id, name: col.name });
  }

  async function confirmDeleteCollection() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/bookmark-collections/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Delete failed'); return; }
      if (activeCollection === pendingDelete.id) setActiveCollection('all');
      setPendingDelete(null);
      load();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function exportAll() {
    window.location.href = '/api/bookmarks/export';
  }

  const filtered = items.filter(b => {
    if (activeCollection === 'all') return true;
    if (activeCollection === 'uncategorised') return !b.collection_id;
    return b.collection_id === activeCollection;
  });

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#fff', padding: 40, textAlign: 'center', color: '#666' }}>Loading bookmarks…</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', padding: '20px 16px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 20 }}>Verity Post</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Saved Stories · {isPaid ? items.length : `${items.length} of ${FREE_BOOKMARK_CAP}`}
          </h1>
          {isPaid && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={exportAll} style={btnGhost}>Export JSON</button>
              <button onClick={() => setShowNewCollection(true)} style={btnSolid}>+ Collection</button>
            </div>
          )}
        </div>

        {atCap && (
          <Banner tone="warn" title="You’ve hit the free bookmark cap.">
            Unlimited bookmarks, collections, notes, and export are available on paid plans.{' '}
            <a href="/profile/settings/billing" style={{ color: '#111', fontWeight: 600 }}>View plans →</a>
          </Banner>
        )}
        {error && <Banner tone="danger" title="Problem">{error}</Banner>}

        {showNewCollection && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} placeholder="Collection name…"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none' }} />
            <button onClick={createCollection} style={btnSolid}>Create</button>
            <button onClick={() => setShowNewCollection(false)} style={btnGhost}>Cancel</button>
          </div>
        )}

        {isPaid && collections.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ id: 'all', name: `All (${items.length})` }, { id: 'uncategorised', name: 'Uncategorised' }, ...collections].map(c => {
              const active = activeCollection === c.id;
              const countSuffix = c.bookmark_count != null && c.id !== 'all' && c.id !== 'uncategorised' ? ` (${c.bookmark_count})` : '';
              return (
                <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => setActiveCollection(c.id)} style={{
                    padding: '6px 14px', borderRadius: 20, border: active ? 'none' : '1px solid #e5e5e5',
                    background: active ? '#111' : '#f7f7f7', color: active ? '#fff' : '#666',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>{c.name}{countSuffix}</button>
                  {c.id !== 'all' && c.id !== 'uncategorised' && (
                    <button
                      type="button"
                      onClick={() => requestDeleteCollection(c)}
                      aria-label={`Delete collection ${c.name}`}
                      title="Delete collection"
                      style={{ background: 'none', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer' }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(b => (
            <div key={b.id} style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>
                <a href={`/story/${b.articles?.slug}`} style={{ color: '#111', textDecoration: 'none' }}>{b.articles?.title || 'Untitled'}</a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {b.articles?.categories?.name && <span style={{ fontSize: 12, fontWeight: 600 }}>{stripKidsTag(b.articles.categories.name)}</span>}
                  <span style={{ fontSize: 12, color: '#666' }}>Saved {b.created_at ? new Date(b.created_at).toLocaleDateString() : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isPaid && (
                    <select
                      value={b.collection_id || ''}
                      onChange={e => moveToCollection(b.id, e.target.value || null)}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e5e5', background: '#fff' }}
                    >
                      <option value="">Uncategorised</option>
                      {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => removeBookmark(b.id)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                </div>
              </div>

              {isPaid && (
                editingNotes === b.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={2}
                      style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => saveNotes(b.id)} style={btnSolid}>Save</button>
                    <button onClick={() => { setEditingNotes(null); setNoteDraft(''); }} style={btnGhost}>Cancel</button>
                  </div>
                ) : (
                  b.notes ? (
                    <div onClick={() => { setEditingNotes(b.id); setNoteDraft(b.notes || ''); }} style={{ fontSize: 12, color: '#444', background: '#fff', padding: 8, borderRadius: 6, cursor: 'pointer', border: '1px solid #e5e5e5' }}>
                      {b.notes}
                    </div>
                  ) : (
                    <button onClick={() => { setEditingNotes(b.id); setNoteDraft(''); }} style={{ background: 'none', border: 'none', fontSize: 11, color: '#666', cursor: 'pointer', padding: 0, fontStyle: 'italic' }}>+ Add note</button>
                  )
                )
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 6 }}>No saved articles here</div>
              <a href="/" style={{ display: 'inline-block', padding: '10px 20px', background: '#111', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', marginTop: 12 }}>Browse articles</a>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete collection?"
        message={pendingDelete ? `Bookmarks inside "${pendingDelete.name}" become uncategorised. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDeleteCollection}
        onClose={() => !deleteBusy && setPendingDelete(null)}
      />
    </div>
  );
}

function Banner({ tone, title, children }) {
  const map = { warn: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' }, danger: { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' } };
  const s = map[tone] || { bg: '#f7f7f7', border: '#e5e5e5', color: '#111' };
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{title}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{children}</div>
    </div>
  );
}

const btnSolid = { padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '8px 14px', background: 'transparent', color: '#111', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
