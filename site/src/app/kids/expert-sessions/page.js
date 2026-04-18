'use client';
import { useState, useEffect } from 'react';
import { KID } from '@/lib/kidTheme';
import EmptyState from '@/components/kids/EmptyState';

// D9 — kid-facing list of upcoming expert sessions. No discussions,
// just scheduled live Q&As kids can attend.

export default function KidExpertSessions() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/expert-sessions?status=scheduled');
      const data = await res.json();
      setSessions(data.sessions || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: 'calc(100dvh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: KID.font.sub, color: KID.dim }}>One sec…</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto', padding: `${KID.space.cardPad}px 16px 80px` }}>
        <h1 style={{
          fontSize: KID.font.h1, fontWeight: KID.weight.extra,
          color: KID.text, margin: '0 0 6px',
          letterSpacing: KID.tracking.tight, lineHeight: KID.leading.heading,
        }}>
          Expert sessions
        </h1>
        <p style={{
          fontSize: KID.font.sub, color: KID.dim,
          marginTop: 0, marginBottom: KID.space.sectionGap,
          lineHeight: KID.leading.relaxed,
        }}>
          Ask a real expert during a scheduled live window.
        </p>

        {sessions.length === 0 ? (
          <EmptyState
            icon="mic"
            tone="accent"
            title="No sessions scheduled right now"
            body="Check back soon — new expert windows open up regularly."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
            {sessions.map(s => {
              const start = new Date(s.scheduled_at);
              const end = new Date(start.getTime() + (s.duration_minutes || 30) * 60000);
              const now = Date.now();
              const live = now >= start.getTime() && now <= end.getTime();
              return (
                <a
                  key={s.id}
                  href={`/kids/expert-sessions/${s.id}`}
                  style={{
                    display: 'block', background: KID.card,
                    border: `2px solid ${live ? KID.accent : KID.border}`,
                    borderRadius: KID.radius.card,
                    padding: KID.space.cardPad,
                    minHeight: KID.space.hitMin,
                    textDecoration: 'none', color: KID.text,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {live && (
                      <span style={{
                        fontSize: KID.font.label, padding: '4px 10px',
                        borderRadius: KID.radius.chip,
                        background: KID.danger, color: KID.onAccent,
                        fontWeight: KID.weight.extra, letterSpacing: KID.tracking.loose,
                        textTransform: 'uppercase',
                      }}>Live</span>
                    )}
                    <span style={{
                      fontSize: KID.font.h3, fontWeight: KID.weight.bold,
                      lineHeight: KID.leading.heading,
                    }}>{s.title}</span>
                  </div>
                  <div style={{ fontSize: KID.font.sub, color: KID.dim }}>
                    {s.users?.display_name || s.users?.username} · {s.categories?.name || 'All'} · {start.toLocaleString()}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
