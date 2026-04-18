'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

// D36 editor curator. Create a recap, set the week, assign articles,
// add questions manually. AI-generated questions are a later build.

export default function AdminRecap() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [recaps, setRecaps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ title: '', week_start: '', week_end: '', category_id: '', description: '' });
  const [qForm, setQForm] = useState(null);
  const [error, setError] = useState('');
  const [destructive, setDestructive] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      if (!((r || []).some(x => ['editor', 'admin', 'superadmin', 'owner'].includes(x.roles?.name)))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      const [recRes, catRes] = await Promise.all([
        fetch('/api/admin/recap').then(r => r.json()),
        supabase.from('categories').select('id, name').order('name'),
      ]);
      setRecaps(recRes.recaps || []);
      setCategories(catRes.data || []);
      setLoading(false);
    })();
  }, []);

  async function createRecap() {
    setError('');
    if (!form.title || !form.week_start || !form.week_end) { setError('title, week_start, week_end required'); return; }
    const res = await fetch('/api/admin/recap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, category_id: form.category_id || null }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Create failed'); return; }
    setForm({ title: '', week_start: '', week_end: '', category_id: '', description: '' });
    const all = await fetch('/api/admin/recap').then(r => r.json());
    setRecaps(all.recaps || []);
  }

  async function selectRecap(id) {
    const res = await fetch(`/api/admin/recap/${id}`);
    const data = await res.json();
    setSelected(data.recap);
    setQuestions(data.questions || []);
    setQForm(null);
  }

  function startNewQuestion() {
    setQForm({
      question_text: '', article_id: '',
      options: [{ text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }],
      explanation: '', sort_order: questions.length,
    });
  }

  async function saveQuestion() {
    setError('');
    if (!qForm.question_text) { setError('question required'); return; }
    if (qForm.options.filter(o => o.is_correct).length !== 1) { setError('mark exactly one correct option'); return; }
    const isNew = !qForm.id;
    const url = isNew ? `/api/admin/recap/${selected.id}/questions` : `/api/admin/recap/questions/${qForm.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_text: qForm.question_text,
        article_id: qForm.article_id || null,
        options: qForm.options.filter(o => o.text.trim()),
        explanation: qForm.explanation || null,
        sort_order: qForm.sort_order,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Save failed'); return; }
    setQForm(null);
    selectRecap(selected.id);
  }

  function deleteQuestion(id) {
    const q = questions.find(x => x.id === id);
    if (!q) return;
    const rawText = q.question_text || '';
    const shortText = rawText.length > 40 ? rawText.slice(0, 40) : rawText;
    setDestructive({
      title: `Delete recap question "${shortText}"?`,
      message: 'Removes this question from the weekly recap. User attempts and answers against it are preserved.',
      confirmText: shortText,
      confirmLabel: 'Delete question',
      reasonRequired: false,
      action: 'recap_question.delete',
      targetTable: 'weekly_recap_questions',
      targetId: id,
      oldValue: { id, question_text: rawText },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/recap/questions/${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        if (selected) selectRecap(selected.id);
      },
    });
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Weekly recap curator</h1>
      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>New recap</div>
            <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inp} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input type="date" value={form.week_start} onChange={e => setForm({ ...form, week_start: e.target.value })} style={inp} />
              <input type="date" value={form.week_end} onChange={e => setForm({ ...form, week_end: e.target.value })} style={inp} />
            </div>
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={{ ...inp, marginTop: 6 }}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={createRecap} style={{ ...btnSolid, marginTop: 8, width: '100%' }}>Create</button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 6 }}>Recaps</div>
          {recaps.map(r => (
            <button key={r.id} onClick={() => selectRecap(r.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
              padding: '8px 10px', borderRadius: 8,
              border: `1px solid ${selected?.id === r.id ? C.accent : C.border}`,
              background: selected?.id === r.id ? '#ede9fe' : C.card,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.title}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{r.categories?.name || 'All'} · {new Date(r.week_start).toLocaleDateString()}</div>
            </button>
          ))}
        </div>

        <div>
          {!selected ? <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>Pick a recap.</div> : (
            <>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.title}</div>
                <div style={{ fontSize: 12, color: C.dim }}>
                  {new Date(selected.week_start).toLocaleDateString()} – {new Date(selected.week_end).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Questions ({questions.length})</div>
                <button onClick={startNewQuestion} style={btnGhost}>+ Add question</button>
              </div>

              {qForm && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <textarea rows={2} placeholder="Question" value={qForm.question_text}
                    onChange={e => setQForm({ ...qForm, question_text: e.target.value })}
                    style={{ ...inp, marginBottom: 6 }} />
                  <input placeholder="Article ID (source for 'missed')" value={qForm.article_id}
                    onChange={e => setQForm({ ...qForm, article_id: e.target.value })}
                    style={{ ...inp, marginBottom: 8 }} />
                  {qForm.options.map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                      <input type="radio" name={`q-correct`} checked={opt.is_correct}
                        onChange={() => setQForm({ ...qForm, options: qForm.options.map((o, i) => ({ ...o, is_correct: i === oi })) })} />
                      <input value={opt.text} placeholder={`Option ${oi + 1}`}
                        onChange={e => setQForm({ ...qForm, options: qForm.options.map((o, i) => i === oi ? { ...o, text: e.target.value } : o) })}
                        style={{ ...inp, flex: 1 }} />
                    </div>
                  ))}
                  <input placeholder="Explanation" value={qForm.explanation}
                    onChange={e => setQForm({ ...qForm, explanation: e.target.value })}
                    style={{ ...inp, marginTop: 6 }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={saveQuestion} style={btnSolid}>Save</button>
                    <button onClick={() => setQForm(null)} style={btnGhost}>Cancel</button>
                  </div>
                </div>
              )}

              {questions.map(q => (
                <div key={q.id} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{q.question_text}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    {(q.options || []).length} options · {q.article_id ? `article ${q.article_id.slice(0, 8)}` : 'no article'}
                  </div>
                  <button onClick={() => setQForm({ ...q })} style={{ ...btnGhost, fontSize: 11, padding: '4px 10px', marginTop: 6, marginRight: 4 }}>Edit</button>
                  <button onClick={() => deleteQuestion(q.id)} style={{ ...btnGhost, fontSize: 11, padding: '4px 10px', marginTop: 6, color: C.danger }}>Delete</button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructive(null); }
        }}
      />
    </div>
  );
}

const inp = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' };
const btnSolid = { padding: '7px 14px', borderRadius: 7, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '7px 14px', borderRadius: 7, border: '1px solid #e5e5e5', background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
