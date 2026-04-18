'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '../lib/supabase/client';
import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

// D1: article quiz needs a pool of 10-15 questions. Each attempt draws 5
// random. This component is the per-article pool editor, usable both as
// a full-page surface (via /admin/stories/[id]/quiz) and embedded inside
// story-manager accordions (Pass 16 Task 136).
//
// Props:
//   articleId — uuid of the article whose pool is being edited.
//   compact   — when true, hide the full-screen chrome (back link,
//               page title, article subhead). Default false.
//   onSaved   — optional callback fired after a successful save.
//
// Auth: component runs its own admin/editor/owner check on mount; the
// full-screen route also checks server-side guards upstream. Embedded
// use inside story-manager inherits the surface's auth gate but the
// belt-and-braces check here costs one extra roundtrip and guards
// against deep-linking into the component.

const MIN_POOL = 10;
const MAX_POOL = 15;
const OPTIONS_PER_Q = 4;
const DEFAULT_QTYPE = 'multiple_choice';
const TF_OPTIONS = ['True', 'False'];

function emptyQuestion(qtype = DEFAULT_QTYPE) {
  if (qtype === 'true_false') {
    return {
      id: null,
      question_text: '',
      question_type: 'true_false',
      options: TF_OPTIONS.map((text, i) => ({ text, is_correct: i === 0 })),
      explanation: '',
      points: 10,
      is_active: true,
      _dirty: true,
    };
  }
  return {
    id: null,
    question_text: '',
    question_type: DEFAULT_QTYPE,
    options: Array.from({ length: OPTIONS_PER_Q }, () => ({ text: '', is_correct: false })),
    explanation: '',
    points: 10,
    is_active: true,
    _dirty: true,
  };
}

export default function QuizPoolEditor({ articleId, compact = false, onSaved }) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [article, setArticle] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    if (!articleId) return;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthorized(false); setLoading(false); return; }
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!['owner', 'admin', 'editor', 'superadmin'].some(r => roleNames.includes(r))) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      const { data: art } = await supabase
        .from('articles')
        .select('id, title, slug')
        .eq('id', articleId)
        .maybeSingle();
      setArticle(art || null);

      const { data: qs } = await supabase
        .from('quizzes')
        .select('id, question_text, question_type, options, explanation, points, is_active, sort_order, deleted_at')
        .eq('article_id', articleId)
        .is('deleted_at', null)
        .order('sort_order');

      setQuestions((qs || []).map(q => ({
        ...q,
        question_type: q.question_type || DEFAULT_QTYPE,
        options: Array.isArray(q.options) && q.options.length
          ? q.options.map(o => ({ text: o.text ?? '', is_correct: !!o.is_correct }))
          : emptyQuestion(q.question_type || DEFAULT_QTYPE).options,
        _dirty: false,
      })));
      setLoading(false);
    })();
  }, [articleId]);

  function updateQuestion(index, patch) {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...patch, _dirty: true } : q));
  }

  function switchQuestionType(index, nextType) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== index) return q;
      if (q.question_type === nextType) return q;
      if (nextType === 'true_false') {
        const prevCorrect = q.options.findIndex(o => o.is_correct);
        const correctIdx = prevCorrect === 1 ? 1 : 0;
        return {
          ...q,
          question_type: 'true_false',
          options: TF_OPTIONS.map((text, i2) => ({ text, is_correct: i2 === correctIdx })),
          _dirty: true,
        };
      }
      // multiple_choice: restore a 4-option shape, preserving first two
      // options' text if previously T/F (they'll be "True"/"False" —
      // clear them so the editor starts fresh).
      return {
        ...q,
        question_type: 'multiple_choice',
        options: Array.from({ length: OPTIONS_PER_Q }, () => ({ text: '', is_correct: false })),
        _dirty: true,
      };
    }));
  }

  function updateOption(qIdx, optIdx, patch) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {
        ...q,
        options: q.options.map((o, j) => j === optIdx ? { ...o, ...patch } : o),
        _dirty: true,
      };
    }));
  }
  function setCorrect(qIdx, optIdx) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {
        ...q,
        options: q.options.map((o, j) => ({ ...o, is_correct: j === optIdx })),
        _dirty: true,
      };
    }));
  }
  function addQuestion(qtype = DEFAULT_QTYPE) {
    if (questions.length >= MAX_POOL) {
      setError(`Max pool size is ${MAX_POOL}. Delete or deactivate one before adding another.`);
      return;
    }
    setQuestions(prev => [...prev, emptyQuestion(qtype)]);
  }
  async function removeQuestion(index) {
    const q = questions[index];
    if (q.id) {
      // Soft-delete saved rows to keep historical quiz_attempts referential integrity.
      const { error: delErr } = await supabase
        .from('quizzes')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', q.id);
      if (delErr) { setError(delErr.message); return; }
    }
    setQuestions(prev => prev.filter((_, i) => i !== index));
  }

  function validateAll() {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) return `Question ${i + 1} is empty.`;
      const filled = q.options.filter(o => o.text.trim()).length;
      const minFilled = q.question_type === 'true_false' ? 2 : 2;
      if (filled < minFilled) return `Question ${i + 1} needs at least ${minFilled} options.`;
      const correct = q.options.filter(o => o.is_correct).length;
      if (correct !== 1) return `Question ${i + 1} needs exactly one correct option.`;
      const correctIdx = q.options.findIndex(o => o.is_correct);
      if (!q.options[correctIdx].text.trim()) {
        return `Question ${i + 1}: the correct option is empty.`;
      }
    }
    return null;
  }

  async function saveAll() {
    setError(''); setFlash('');
    const msg = validateAll();
    if (msg) { setError(msg); return; }

    setSaving(true);
    try {
      const rowsToSave = questions.map((q, i) => ({ local: q, i })).filter(x => x.local._dirty);

      for (const { local, i } of rowsToSave) {
        const payload = {
          article_id: articleId,
          question_text: local.question_text.trim(),
          options: local.options
            .filter(o => o.text.trim())
            .map(o => ({ text: o.text.trim(), is_correct: !!o.is_correct })),
          explanation: local.explanation?.trim() || null,
          points: Number(local.points) || 10,
          is_active: !!local.is_active,
          sort_order: i,
          question_type: local.question_type || DEFAULT_QTYPE,
        };
        if (local.id) {
          const { error: upErr } = await supabase
            .from('quizzes')
            .update(payload)
            .eq('id', local.id);
          if (upErr) throw upErr;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('quizzes')
            .insert({ ...payload, title: `${article?.title || 'Article'} — Q${i + 1}` })
            .select('id')
            .single();
          if (insErr) throw insErr;
          setQuestions(prev => prev.map((q, qi) => qi === i ? { ...q, id: inserted.id, _dirty: false } : q));
        }
      }
      setQuestions(prev => prev.map(q => ({ ...q, _dirty: false })));
      setFlash('Saved.');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: compact ? 12 : 40, color: C.dim, fontSize: 13 }}>Loading…</div>;
  }
  if (!authorized) {
    return <div style={{ padding: compact ? 12 : 40, color: C.dim, fontSize: 13 }}>Not authorized.</div>;
  }

  const activeCount = questions.filter(q => q.is_active).length;
  const readyToShip = activeCount >= MIN_POOL;

  return (
    <div style={{
      maxWidth: compact ? 'none' : 900,
      margin: compact ? 0 : '0 auto',
      padding: compact ? 0 : '24px 20px 80px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {!compact && (
        <>
          <a href="/admin/stories" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>All stories</a>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 4px' }}>Quiz pool</h1>
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 6 }}>{article?.title || '—'}</div>
        </>
      )}

      <div style={{
        background: readyToShip ? '#ecfdf5' : '#fffbeb',
        border: `1px solid ${readyToShip ? C.success : C.warn}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13,
      }}>
        <b style={{ color: readyToShip ? C.success : C.warn }}>
          Pool size: {activeCount} / {MIN_POOL}–{MAX_POOL}
        </b>
        {' '}
        {readyToShip
          ? '— quiz is servable.'
          : '— articles need at least 10 active questions before the quiz goes live (D1).'}
      </div>

      {questions.map((q, qi) => (
        <div key={qi} style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '14px 16px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase' }}>Question {qi + 1}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={q.question_type || DEFAULT_QTYPE}
                onChange={e => switchQuestionType(qi, e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
              >
                <option value="multiple_choice">Multiple choice</option>
                <option value="true_false">True / False</option>
              </select>
              <label style={{ fontSize: 11, color: C.dim }}>
                <input type="checkbox" checked={!!q.is_active} onChange={e => updateQuestion(qi, { is_active: e.target.checked })} style={{ marginRight: 4 }} />
                Active
              </label>
              <button onClick={() => removeQuestion(qi)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
          <textarea
            value={q.question_text}
            onChange={e => updateQuestion(qi, { question_text: e.target.value })}
            placeholder="Question text…"
            rows={2}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
          />
          {q.options.map((opt, oi) => (
            <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input
                type="radio"
                name={`correct-${articleId}-${qi}`}
                checked={!!opt.is_correct}
                onChange={() => setCorrect(qi, oi)}
                title="Mark as correct"
              />
              {q.question_type === 'true_false' ? (
                <div style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: `1px solid ${opt.is_correct ? C.success : C.border}`, fontSize: 13, background: opt.is_correct ? '#ecfdf5' : C.bg, color: C.text }}>
                  {opt.text}
                </div>
              ) : (
                <input
                  value={opt.text}
                  onChange={e => updateOption(qi, oi, { text: e.target.value })}
                  placeholder={`Option ${['A', 'B', 'C', 'D'][oi] || oi + 1}`}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: `1px solid ${opt.is_correct ? C.success : C.border}`, fontSize: 13, outline: 'none' }}
                />
              )}
            </div>
          ))}
          <input
            value={q.explanation || ''}
            onChange={e => updateQuestion(qi, { explanation: e.target.value })}
            placeholder="Explanation shown after every attempt (D41)"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, outline: 'none', marginTop: 8, color: C.dim }}
          />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => addQuestion('multiple_choice')} disabled={questions.length >= MAX_POOL} style={{
          padding: '8px 16px', borderRadius: 8, border: `1px dashed ${C.border}`,
          background: 'transparent', color: questions.length >= MAX_POOL ? C.dim : C.text,
          fontSize: 13, fontWeight: 600, cursor: questions.length >= MAX_POOL ? 'default' : 'pointer',
        }}>Add multiple-choice</button>
        <button onClick={() => addQuestion('true_false')} disabled={questions.length >= MAX_POOL} style={{
          padding: '8px 16px', borderRadius: 8, border: `1px dashed ${C.border}`,
          background: 'transparent', color: questions.length >= MAX_POOL ? C.dim : C.text,
          fontSize: 13, fontWeight: 600, cursor: questions.length >= MAX_POOL ? 'default' : 'pointer',
        }}>Add true/false</button>
        <button onClick={saveAll} disabled={saving} style={{
          padding: '8px 20px', borderRadius: 8, border: 'none',
          background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: saving ? 'default' : 'pointer',
        }}>{saving ? 'Saving…' : 'Save all'}</button>
        {flash && <span style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>{flash}</span>}
        {error && <span style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</span>}
      </div>
    </div>
  );
}
