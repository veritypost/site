// @migrated-to-permissions 2026-04-18
// @feature-verified recap 2026-04-18
'use client';
import { useEffect, useState, CSSProperties } from 'react';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

type RecapAttempt = Pick<Tables<'weekly_recap_attempts'>, 'score' | 'total_questions'>;
type RecapRow = Tables<'weekly_recap_quizzes'> & { my_attempt?: RecapAttempt | null };

export default function RecapCard() {
  const [recap, setRecap] = useState<RecapRow | null>(null);
  const [canView, setCanView] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      const allowed = hasPermission('recap.list.view');
      if (cancelled) return;
      setCanView(allowed);
      if (!allowed) return;
      const res = await fetch('/api/recap');
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { recaps?: RecapRow[]; paid?: boolean };
      if (cancelled) return;
      if ((data.recaps || []).length > 0) setRecap(data.recaps![0]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (canView === null) return null;

  const cardStyle: CSSProperties = {
    display: 'block',
    background: 'linear-gradient(135deg, #111 0%, #333 100%)',
    color: '#fff',
    borderRadius: 14,
    padding: '18px 20px',
    textDecoration: 'none',
    margin: '16px 0',
  };
  const eyebrowStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.7,
    letterSpacing: 1,
    textTransform: 'uppercase',
  };
  const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 800, margin: '6px 0' };
  const subStyle: CSSProperties = { fontSize: 12, opacity: 0.8 };

  if (!canView) {
    return (
      <a href="/profile/settings/billing" style={cardStyle}>
        <div style={eyebrowStyle}>Weekly recap</div>
        <div style={titleStyle}>See what you missed this week</div>
        <div style={subStyle}>Available on paid plans.</div>
      </a>
    );
  }

  if (!recap) return null;
  const done = !!recap.my_attempt;
  return (
    <a href={`/recap/${recap.id}`} style={cardStyle}>
      <div style={eyebrowStyle}>Weekly recap</div>
      <div style={titleStyle}>{recap.title}</div>
      <div style={subStyle}>
        {done && recap.my_attempt
          ? `Your score: ${recap.my_attempt.score}/${recap.my_attempt.total_questions}`
          : 'See what you missed this week →'}
      </div>
    </a>
  );
}
