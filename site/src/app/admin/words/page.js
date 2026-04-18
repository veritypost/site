'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

export default function WordsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState('reserved');
  const [reserved, setReserved] = useState([]);
  const [profanity, setProfanity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newWord, setNewWord] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!profile || !['owner', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      const [reservedRes, profanityRes] = await Promise.all([
        supabase.from('reserved_usernames').select('username').order('username', { ascending: true }),
        supabase.from('blocked_words').select('word').order('word', { ascending: true }),
      ]);

      setReserved((reservedRes.data || []).map(r => r.username).filter(Boolean).sort());
      setProfanity((profanityRes.data || []).map(r => r.word).filter(Boolean).sort());
      setLoading(false);
    }
    init();
  }, []);

  const list = tab === 'reserved' ? reserved : profanity;
  const setList = tab === 'reserved' ? setReserved : setProfanity;

  const filtered = search ? list.filter(w => w.toLowerCase().includes(search.toLowerCase())) : list;

  const addWord = async (words) => {
    const isReserved = tab === 'reserved';
    const table = isReserved ? 'reserved_usernames' : 'blocked_words';
    const toAdd = words.filter(w => !list.includes(w));
    if (toAdd.length === 0) return;
    const rows = toAdd.map(w => isReserved ? { username: w } : { word: w });
    if (isReserved) {
      for (const w of toAdd) {
        const { error: auditErr } = await supabase.rpc('record_admin_action', {
          p_action: 'reserved_username.add',
          p_target_table: 'reserved_usernames',
          p_target_id: null,
          p_reason: null,
          p_old_value: null,
          p_new_value: { username: w },
        });
        if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
      }
    } else {
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'banned_word.add',
        p_target_table: 'blocked_words',
        p_target_id: null,
        p_reason: null,
        p_old_value: null,
        p_new_value: { words: toAdd },
      });
      if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
    }
    const { error } = await supabase.from(table).insert(rows);
    if (!error) {
      setList(prev => [...prev, ...toAdd].sort());
    }
    setNewWord('');
  };

  const addSingle = () => {
    const w = newWord.trim().toLowerCase();
    if (!w) return;
    addWord([w]);
  };

  const addBulk = () => {
    const words = newWord.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    addWord(words);
  };

  const removeWord = async (word) => {
    const isReserved = tab === 'reserved';
    const table = isReserved ? 'reserved_usernames' : 'blocked_words';
    const column = isReserved ? 'username' : 'word';
    if (isReserved) {
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'reserved_username.delete',
        p_target_table: 'reserved_usernames',
        p_target_id: null,
        p_reason: null,
        p_old_value: { username: word },
        p_new_value: null,
      });
      if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
    } else {
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'banned_word.delete',
        p_target_table: 'blocked_words',
        p_target_id: null,
        p_reason: null,
        p_old_value: { word },
        p_new_value: null,
      });
      if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
    }
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(column, word);
    if (!error) {
      setList(prev => prev.filter(w => w !== word));
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Word Lists</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Reserved usernames and profanity filter words</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ k: 'reserved', l: 'Reserved Usernames' }, { k: 'profanity', l: 'Profanity Filter' }].map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); setSearch(''); }} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>
            {t.l} ({(t.k === 'reserved' ? reserved : profanity).length})
          </button>
        ))}
      </div>

      {/* Add */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={newWord} onChange={e => setNewWord(e.target.value)} placeholder={`Add word (or comma-separated)...`}
          onKeyDown={e => e.key === 'Enter' && (newWord.includes(',') ? addBulk() : addSingle())}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, outline: 'none' }} />
        <button onClick={() => newWord.includes(',') ? addBulk() : addSingle()} disabled={!newWord.trim()} style={{
          padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
          background: newWord.trim() ? C.white : C.muted, color: newWord.trim() ? C.bg : C.dim, cursor: newWord.trim() ? 'pointer' : 'default',
        }}>Add</button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter words..."
          style={{ width: 200, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 11, outline: 'none' }} />
        <span style={{ fontSize: 11, color: C.dim, marginLeft: 10 }}>{filtered.length} word{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Word cloud */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {filtered.length === 0 && <span style={{ color: C.dim, fontSize: 12 }}>No words found</span>}
        {filtered.map(word => (
          <div key={word} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`,
            fontSize: 12, color: C.soft, fontFamily: 'monospace',
          }}>
            {word}
            <button onClick={() => removeWord(word)} style={{
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1,
            }}>Remove</button>
          </div>
        ))}
      </div>

      {/* Info */}
      <div style={{ marginTop: 16, padding: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
        {tab === 'reserved'
          ? 'Reserved usernames cannot be claimed by any user. Used for system routes, brand protection, and staff-only names. Checked during signup and username change.'
          : 'Profanity filter words trigger a warning + 30-second cooldown when used in comments. The comment is rejected entirely (not posted with asterisks). User must retype without the word.'
        }
      </div>
    </div>
  );
}
