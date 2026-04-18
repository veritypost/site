'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { assertNotKidMode } from '@/lib/guards';

// D36 — Verity+ only list of this week's recap quizzes.

const C = { card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111', success: '#16a34a' };

export default function RecapListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recaps, setRecaps] = useState([]);
  const [paid, setPaid] = useState(true);

  useEffect(() => {
    if (assertNotKidMode(router)) return;
    (async () => {
      const res = await fetch('/api/recap');
      const data = await res.json();
      setPaid(data.paid !== false);
      setRecaps(data.recaps || []);
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!paid) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 20, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Weekly recap quiz</h1>
        <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, marginBottom: 20 }}>
          Test what you kept up with this week. See which articles you missed.
          Verity and above.
        </p>
        <a href="/profile/settings/billing" style={{ display: 'inline-block', padding: '12px 24px', background: '#111', color: '#fff', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>Upgrade to Verity</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>This week&apos;s recap</h1>
      <p style={{ fontSize: 13, color: C.dim, marginTop: 0, marginBottom: 20 }}>
        A quick test on the past 7 days of coverage. Anything you miss, we surface so you can catch up.
      </p>

      {recaps.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontSize: 13 }}>No recaps ready yet. Check back later.</div>
      ) : recaps.map(r => {
        const done = !!r.my_attempt;
        return (
          <a key={r.id} href={`/recap/${r.id}`} style={{
            display: 'block', background: C.card, border: `1px solid ${done ? C.success : C.border}`,
            borderRadius: 12, padding: 14, marginBottom: 10, textDecoration: 'none', color: C.text,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
              {r.categories?.name || 'All categories'} · Week of {new Date(r.week_start).toLocaleDateString()}
              {done && ` · Completed ${r.my_attempt.score}/${r.my_attempt.total_questions}`}
            </div>
          </a>
        );
      })}
    </div>
  );
}
