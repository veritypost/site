'use client';
import { useEffect, useState } from 'react';

// Home-feed entry point for the weekly recap (D36). For paid viewers,
// fetches this week's recap; for free viewers, shows a teaser that
// points at the paid-plans page (D23 conversion surface).
export default function RecapCard() {
  const [recap, setRecap] = useState(null);
  const [paid, setPaid] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/recap');
      if (!res.ok) return;
      const data = await res.json();
      setPaid(!!data.paid);
      if ((data.recaps || []).length > 0) setRecap(data.recaps[0]);
    })();
  }, []);

  if (paid === null) return null;

  if (!paid) {
    return (
      <a href="/profile/settings/billing" style={{
        display: 'block', background: 'linear-gradient(135deg, #111 0%, #333 100%)',
        color: '#fff', borderRadius: 14, padding: '18px 20px',
        textDecoration: 'none', margin: '16px 0',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase' }}>
          Weekly recap
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0' }}>See what you missed this week</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Available on paid plans.
        </div>
      </a>
    );
  }

  if (!recap) return null;
  const done = !!recap.my_attempt;
  return (
    <a href={`/recap/${recap.id}`} style={{
      display: 'block', background: 'linear-gradient(135deg, #111 0%, #333 100%)',
      color: '#fff', borderRadius: 14, padding: '18px 20px',
      textDecoration: 'none', margin: '16px 0',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase' }}>
        Weekly recap
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0' }}>{recap.title}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        {done ? `Your score: ${recap.my_attempt.score}/${recap.my_attempt.total_questions}` : 'See what you missed this week →'}
      </div>
    </a>
  );
}
