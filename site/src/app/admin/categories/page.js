'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

function CategoryRow({ cat, onToggle, onAddSub, onRemoveSub, onMove, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const [newSub, setNewSub] = useState('');

  const addSub = () => {
    if (!newSub.trim()) return;
    onAddSub(cat.id, newSub.trim());
    setNewSub('');
  };

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        {/* Reorder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={() => onMove(cat.id, -1)} disabled={isFirst} style={{ background: 'none', border: 'none', color: isFirst ? C.muted : C.dim, cursor: isFirst ? 'default' : 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }} aria-label="Move up">Up</button>
          <button onClick={() => onMove(cat.id, 1)} disabled={isLast} style={{ background: 'none', border: 'none', color: isLast ? C.muted : C.dim, cursor: isLast ? 'default' : 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }} aria-label="Move down">Down</button>
        </div>
        {/* Name */}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: cat.visible ? C.white : C.muted }}>{cat.name}</span>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>/{cat.slug}</span>
        </div>
        {/* Sub count */}
        {(cat.subs || []).length > 0 && (
          <button onClick={() => setExpanded(!expanded)} style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
            background: 'none', color: C.dim, cursor: 'pointer', fontWeight: 600,
          }}>
            {cat.subs.length} sub{cat.subs.length > 1 ? 's' : ''} {expanded ? '−' : '+'}
          </button>
        )}
        {(cat.subs || []).length === 0 && (
          <button onClick={() => setExpanded(!expanded)} style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
            background: 'none', color: C.muted, cursor: 'pointer', fontWeight: 600,
          }}>
            + sub
          </button>
        )}
        {/* Visibility */}
        <button onClick={() => onToggle(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: cat.visible ? C.success : '#333', position: 'relative', transition: 'background 0.15s' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: cat.visible ? '#fff' : '#666', position: 'absolute', top: 2, left: cat.visible ? 18 : 2, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
          </div>
        </button>
      </div>
      {/* Expanded subcategories */}
      {expanded && (
        <div style={{ padding: '0 16px 12px 44px' }}>
          {(cat.subs || []).map(sub => (
            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.soft, flex: 1 }}>{sub.name}</span>
              <span style={{ fontSize: 9, color: C.muted }}>/{sub.slug}</span>
              <button onClick={() => onRemoveSub(cat.id, sub.id)} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, cursor: 'pointer' }}>x</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="New subcategory..."
              onKeyDown={e => e.key === 'Enter' && addSub()}
              style={{ flex: 1, padding: '5px 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 11, outline: 'none' }} />
            <button onClick={addSub} disabled={!newSub.trim()} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 5, border: 'none', background: newSub.trim() ? C.accent : C.muted, color: '#fff', cursor: newSub.trim() ? 'pointer' : 'default', fontWeight: 600 }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoriesAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState('adult');
  const [adultCats, setAdultCats] = useState([]);
  const [kidsCats, setKidsCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      const allowed = ['owner', 'superadmin', 'admin', 'editor'];
      if (!allowed.some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      await fetchCategories();
      setLoading(false);
    };
    init();
  }, []);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error || !data) return;

    // Separate parent categories and subcategories
    const parents = data.filter(c => !c.parent_id);
    const subs = data.filter(c => !!c.parent_id);

    const withSubs = parents.map(p => ({
      ...p,
      visible: p.is_active !== false,
      subs: subs.filter(s => s.parent_id === p.id),
    }));

    const adult = withSubs.filter(c => !c.is_kids_safe);
    const kids = withSubs.filter(c => c.is_kids_safe);

    setAdultCats(adult);
    setKidsCats(kids);
  };

  const cats = tab === 'adult' ? adultCats : kidsCats;
  const setCats = tab === 'adult' ? setAdultCats : setKidsCats;

  const toggleVisibility = async (id) => {
    const cat = cats.find(c => c.id === id);
    if (!cat) return;
    const newVisible = !cat.visible;
    const { error } = await supabase.from('categories').update({ is_active: newVisible }).eq('id', id);
    if (!error) setCats(prev => prev.map(c => c.id === id ? { ...c, is_active: newVisible, visible: newVisible } : c));
  };

  const moveCat = async (id, dir) => {
    const idx = cats.findIndex(c => c.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= cats.length) return;
    const next = [...cats];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setCats(next);

    // Persist new sort_order values
    await Promise.all(
      next.map((c, i) => supabase.from('categories').update({ sort_order: i }).eq('id', c.id))
    );
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    const name = newCat.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const isKids = tab === 'kids';
    const sort_order = cats.length;

    const { data, error } = await supabase
      .from('categories')
      .insert({ name, slug, is_active: true, is_kids_safe: isKids, sort_order })
      .select()
      .single();

    if (!error && data) {
      setCats(prev => [...prev, { ...data, visible: data.is_active !== false, subs: [] }]);
    }
    setNewCat('');
  };

  const addSub = async (catId, name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase
      .from('categories')
      .insert({ name, slug, parent_id: catId, is_active: true, is_kids_safe: tab === 'kids' })
      .select()
      .single();

    if (!error && data) {
      setCats(prev => prev.map(c => c.id === catId ? { ...c, subs: [...(c.subs || []), data] } : c));
    }
  };

  const removeSub = async (catId, subId) => {
    const sub = cats.find(c => c.id === catId)?.subs?.find(s => s.id === subId);
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'category.delete',
      p_target_table: 'categories',
      p_target_id: subId,
      p_reason: null,
      p_old_value: sub ? { id: subId, name: sub.name, slug: sub.slug, parent_id: catId } : { id: subId, parent_id: catId },
      p_new_value: null,
    });
    if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
    const { error } = await supabase.from('categories').delete().eq('id', subId);
    if (!error) {
      setCats(prev => prev.map(c => c.id === catId ? { ...c, subs: (c.subs || []).filter(s => s.id !== subId) } : c));
    }
  };

  const visibleCount = cats.filter(c => c.visible).length;
  const totalSubs = cats.reduce((a, c) => a + (c.subs || []).length, 0);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Categories</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Manage news categories and subcategories for adult and kids content</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {['adult', 'kids'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t ? 700 : 500,
            background: tab === t ? C.white : C.card, color: tab === t ? C.bg : C.dim, cursor: 'pointer',
          }}>
            {t === 'adult' ? 'Adult' : 'Kids'} ({(t === 'adult' ? adultCats : kidsCats).length})
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>Categories</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white }}>{cats.length}</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>Visible</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.success }}>{visibleCount}</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>Subcategories</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{totalSubs}</div>
        </div>
      </div>

      {/* Category list */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        {cats.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: 13 }}>
            No {tab} categories yet. Add one below.
          </div>
        )}
        {cats.map((cat, i) => (
          <CategoryRow key={cat.id} cat={cat} onToggle={toggleVisibility} onAddSub={addSub} onRemoveSub={removeSub} onMove={moveCat} isFirst={i === 0} isLast={i === cats.length - 1} />
        ))}
      </div>

      {/* Add new */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder={`New ${tab} category...`}
          onKeyDown={e => e.key === 'Enter' && addCategory()}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, outline: 'none' }} />
        <button onClick={addCategory} disabled={!newCat.trim()} style={{
          padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
          background: newCat.trim() ? C.white : C.muted, color: newCat.trim() ? C.bg : C.dim, cursor: newCat.trim() ? 'pointer' : 'default',
        }}>Add</button>
      </div>
    </div>
  );
}
