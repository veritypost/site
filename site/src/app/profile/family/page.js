'use client';
import { useState, useEffect } from 'react';
import { createClient } from '../../../lib/supabase/client';

// D24: private family dashboard — leaderboard, shared achievements,
// weekly reading report. All data scoped to the family owner.

const C = {
  card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666',
  accent: '#111', success: '#16a34a',
};

export default function FamilyDashboard() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [lb, ach, rep] = await Promise.all([
        fetch('/api/family/leaderboard').then(r => r.json()).catch(() => ({})),
        fetch('/api/family/achievements').then(r => r.json()).catch(() => ({})),
        fetch('/api/family/weekly-report').then(r => r.json()).catch(() => ({})),
      ]);
      if (lb.error) setError(lb.error);
      setMembers(lb.members || []);
      setAchievements(ach.achievements || []);
      setReport(rep || null);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/profile/kids" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Kids</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Family dashboard</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>Private to your household (D24). Nobody outside the family sees any of this.</div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px' }}>Leaderboard</h2>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 20 }}>
        {members.length === 0 ? (
          <div style={{ padding: 20, color: C.dim, fontSize: 13 }}>Add family members to see the board.</div>
        ) : members.map((m, i) => (
          <div key={`${m.kind}-${m.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ width: 24, textAlign: 'center', fontWeight: 800 }}>{i + 1}</span>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: m.kind === 'kid' ? '#ddd6fe' : '#e0f2fe', color: m.kind === 'kid' ? '#5b21b6' : '#075985', fontWeight: 700 }}>
              {m.kind === 'kid' ? 'KID' : 'ADULT'}
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.display}</span>
            <span style={{ fontSize: 12, color: C.dim }}>Streak {m.streak}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{m.score}</span>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px' }}>This week ({report?.week_ending ? new Date(report.week_ending).toLocaleDateString() : ''})</h2>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 20 }}>
        {!(report?.members?.length) ? (
          <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>No activity logged this week.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {report.members.map(m => (
              <div key={`${m.kind}-${m.id}`} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{m.display}</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                  {m.articles_read} reads · {m.quizzes_completed} quizzes
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px' }}>Shared achievements</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {achievements.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 13 }}>No shared achievements configured yet.</div>
        ) : achievements.map(a => {
          const earned = !!a.earned_at;
          return (
            <div key={a.id} style={{
              background: earned ? '#ecfdf5' : C.card,
              border: `1px solid ${earned ? C.success : C.border}`,
              borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div>
              <div style={{ flex: 1, fontSize: 12, color: C.dim }}>{a.description}</div>
              {earned ? (
                <span style={{ fontSize: 11, color: C.success, fontWeight: 700 }}>Earned {new Date(a.earned_at).toLocaleDateString()}</span>
              ) : (
                <span style={{ fontSize: 11, color: C.dim }}>In progress</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
