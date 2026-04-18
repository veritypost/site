'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { assertNotKidMode } from '@/lib/guards';

const C = { card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111', success: '#16a34a', danger: '#dc2626' };

export default function RecapPlayer() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recap, setRecap] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [articleSlugs, setArticleSlugs] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (assertNotKidMode(router)) return;
    (async () => {
      const res = await fetch(`/api/recap/${id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Load failed'); setLoading(false); return; }
      setRecap(data.recap);
      setQuestions(data.questions || []);
      setLoading(false);
    })();
  }, [id]);

  async function submit() {
    setBusy(true); setError('');
    const payload = questions
      .filter(q => typeof answers[q.id] === 'number')
      .map(q => ({ question_id: q.id, selected_answer: answers[q.id] }));
    const res = await fetch(`/api/recap/${id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error || 'Submit failed'); return; }
    setResult(data);

    const articleIds = Array.from(new Set((data.results || [])
      .map(r => r.article_id)
      .filter(Boolean)));
    if (articleIds.length > 0) {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('articles')
        .select('id, slug')
        .in('id', articleIds);
      if (rows) {
        const map = {};
        for (const r of rows) if (r.slug) map[r.id] = r.slug;
        setArticleSlugs(map);
      }
    }
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!recap) return <div style={{ padding: 40, color: C.dim }}>{error || 'Not found'}</div>;

  const allAnswered = questions.length > 0 && questions.every(q => typeof answers[q.id] === 'number');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/recap" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← All recaps</a>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '6px 0 4px' }}>{recap.title}</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>
        Week of {new Date(recap.week_start).toLocaleDateString()} · {recap.categories?.name || 'All categories'}
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}

      {!result ? (
        <>
          {questions.map((q, qi) => (
            <div key={q.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 4 }}>Question {qi + 1}</div>
              <div style={{ fontSize: 14, marginBottom: 10 }}>{q.question_text}</div>
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === oi;
                return (
                  <label key={oi} style={{
                    display: 'block', padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${selected ? C.accent : C.border}`,
                    background: selected ? '#fff' : 'transparent',
                    marginBottom: 6, cursor: 'pointer', fontSize: 13,
                  }}>
                    <input type="radio" name={`q-${q.id}`} checked={selected}
                      onChange={() => setAnswers(prev => ({ ...prev, [q.id]: oi }))}
                      style={{ marginRight: 8 }} />
                    {opt.text}
                  </label>
                );
              })}
            </div>
          ))}
          <button onClick={submit} disabled={!allAnswered || busy} style={{
            padding: '10px 22px', borderRadius: 9, border: 'none',
            background: allAnswered && !busy ? C.accent : '#ccc', color: '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: allAnswered && !busy ? 'pointer' : 'default',
          }}>{busy ? 'Grading…' : 'Submit'}</button>
        </>
      ) : (
        <div>
          <div style={{ background: '#ecfdf5', border: `1px solid ${C.success}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.success }}>Scored {result.score} of {result.total}</div>
            {result.articles_missed?.length > 0 && (
              <div style={{ fontSize: 13, color: C.text, marginTop: 6 }}>
                You missed <b>{result.articles_missed.length}</b> article{result.articles_missed.length === 1 ? '' : 's'} this week — surfaced below so you can catch up.
              </div>
            )}
          </div>

          {result.results.map((r, i) => (
            <div key={r.question_id} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>Question {i + 1}</div>
              <div style={{ fontSize: 14 }}>{r.question_text}</div>
              <div style={{ fontSize: 13, color: r.is_correct ? C.success : C.danger, fontWeight: 600, marginTop: 6 }}>
                {r.is_correct ? 'Correct' : `Incorrect — correct answer: ${r.options[r.correct_answer]?.text ?? '—'}`}
              </div>
              {r.explanation && <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{r.explanation}</div>}
              {!r.is_correct && r.article_id && articleSlugs[r.article_id] && (
                <a href={`/story/${articleSlugs[r.article_id]}`} style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginTop: 6, display: 'inline-block' }}>
                  Read the article
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
