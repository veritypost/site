'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { clearKidMode, getActiveKidId } from '../../../../lib/kidMode';
import Badge from '@/components/kids/Badge';

// Parental dashboard for a single kid (D34). Reads, quiz history,
// streak, time spent, achievements. Pause/resume toggle. Upcoming
// expert sessions the kid can attend. Activity timeline of the last
// ~25 events across reads / quizzes / badges / expert questions.

const C = {
  card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666',
  accent: '#111', success: '#16a34a', warn: '#b45309', danger: '#dc2626',
};

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function KidDashboard() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [kid, setKid] = useState(null);
  const [stats, setStats] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [leaderboardBusy, setLeaderboardBusy] = useState(false);

  async function load() {
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/'); return; }

    const { data: k } = await supabase
      .from('kid_profiles')
      .select('*')
      .eq('id', id).maybeSingle();
    if (!k || k.parent_user_id !== user.id) { router.push('/profile/kids'); return; }
    setKid(k);

    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      { count: reads7d },
      { count: quizzesTotal },
      { data: recentAttempts },
      { data: achievements },
      { data: readingTimeline },
      { data: questionTimeline },
      { data: sessions },
    ] = await Promise.all([
      supabase.from('reading_log').select('id', { count: 'exact', head: true }).eq('kid_profile_id', id).gte('created_at', since7d),
      supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('kid_profile_id', id),
      supabase.from('quiz_attempts').select('article_id, attempt_number, is_correct, created_at').eq('kid_profile_id', id).order('created_at', { ascending: false }).limit(60),
      supabase.from('user_achievements').select('id, earned_at, achievements(key, display_name, icon_name)').eq('kid_profile_id', id).order('earned_at', { ascending: false }).limit(20),
      supabase.from('reading_log').select('id, created_at, completed, articles(title, slug)').eq('kid_profile_id', id).eq('completed', true).gte('created_at', since30d).order('created_at', { ascending: false }).limit(25),
      supabase.from('kid_expert_questions').select('id, created_at, question_text, kid_expert_sessions(title)').eq('kid_profile_id', id).gte('created_at', since30d).order('created_at', { ascending: false }).limit(25),
      supabase.from('kid_expert_sessions').select('id, title, scheduled_at, duration_minutes, categories(name)').gte('scheduled_at', new Date().toISOString()).eq('is_active', true).order('scheduled_at', { ascending: true }).limit(5),
    ]);

    const byAttempt = {};
    for (const a of recentAttempts || []) {
      const key = `${a.article_id}:${a.attempt_number}`;
      if (!byAttempt[key]) byAttempt[key] = { article_id: a.article_id, attempt_number: a.attempt_number, at: a.created_at, correct: 0 };
      if (a.is_correct) byAttempt[key].correct += 1;
    }
    const attemptSummaries = Object.values(byAttempt);

    setStats({
      reads7d: reads7d || 0,
      quizzesTotal: quizzesTotal || 0,
      recentAttempts: attemptSummaries.slice(0, 8),
      achievements: achievements || [],
    });

    const events = [];
    for (const r of readingTimeline || []) {
      events.push({
        kind: 'read',
        at: r.created_at,
        label: r.articles?.title || 'Article',
        href: r.articles?.slug ? `/kids/story/${r.articles.slug}` : null,
      });
    }
    for (const a of attemptSummaries) {
      if (a.correct >= 3) {
        events.push({
          kind: 'quiz_pass',
          at: a.at,
          label: `Passed quiz (${a.correct}/5)`,
        });
      }
    }
    for (const ach of achievements || []) {
      events.push({
        kind: 'badge',
        at: ach.earned_at,
        label: `Earned badge: ${ach.achievements?.display_name || ach.achievements?.key || 'Badge'}`,
      });
    }
    for (const q of questionTimeline || []) {
      events.push({
        kind: 'question',
        at: q.created_at,
        label: `Asked in “${q.kid_expert_sessions?.title || 'expert session'}”`,
      });
    }
    events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    setTimeline(events.slice(0, 25));

    setUpcoming(sessions || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function useFreeze() {
    if (freezeBusy) return;
    setFreezeBusy(true); setError(''); setFlash('');
    try {
      const res = await fetch(`/api/kids/${id}/streak-freeze`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Freeze failed'); return; }
      setFlash(`Streak freeze used. ${data.remaining}/${data.cap} left this week.`);
      load();
    } finally { setFreezeBusy(false); }
  }

  async function togglePause() {
    if (!kid || pauseBusy) return;
    setPauseBusy(true); setError(''); setFlash('');
    const nextPaused = !kid.paused_at;
    try {
      const res = await fetch(`/api/kids/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Could not change pause state');
        return;
      }
      if (nextPaused && getActiveKidId() === id) clearKidMode();
      setFlash(nextPaused ? 'Paused. Kid surfaces are hidden until you resume.' : 'Resumed.');
      load();
    } finally {
      setPauseBusy(false);
    }
  }

  async function toggleLeaderboard() {
    if (!kid || leaderboardBusy) return;
    setLeaderboardBusy(true); setError(''); setFlash('');
    const next = !kid.global_leaderboard_opt_in;
    try {
      const res = await fetch(`/api/kids/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ global_leaderboard_opt_in: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Could not change leaderboard setting');
        return;
      }
      setFlash(next
        ? `${kid.display_name} will appear on the global leaderboard.`
        : `${kid.display_name} is off the global leaderboard.`
      );
      load();
    } finally {
      setLeaderboardBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!kid) return null;

  const paused = !!kid.paused_at;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/profile/kids" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← All kids</a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: kid.avatar_color || C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 700 }}>
          {(kid.display_name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{kid.display_name}</h1>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            Score {kid.verity_score || 0} · Streak {kid.streak_current || 0}
            {kid.metadata?.trial && ' · Trial'}
            {paused && ' · Paused'}
          </div>
        </div>
        <button
          onClick={togglePause}
          disabled={pauseBusy}
          style={{
            padding: '8px 14px', borderRadius: 9,
            border: `1px solid ${paused ? C.success : C.border}`,
            background: paused ? C.success : 'transparent',
            color: paused ? '#fff' : C.text,
            fontSize: 13, fontWeight: 700,
            cursor: pauseBusy ? 'default' : 'pointer', opacity: pauseBusy ? 0.5 : 1,
          }}
        >{pauseBusy ? '…' : paused ? 'Resume access' : 'Pause access'}</button>
      </div>

      {flash && <div style={{ background: '#ecfdf5', border: `1px solid ${C.success}`, color: C.success, borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {error && <div style={{ background: '#fef2f2', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Stat label="Reads (7d)" value={stats.reads7d} />
        <Stat label="Quizzes total" value={stats.quizzesTotal} />
        <Stat label="Best streak" value={kid.streak_best || 0} />
        <Stat label="Freezes this week" value={kid.streak_freeze_remaining ?? '—'} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={useFreeze} disabled={freezeBusy} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: freezeBusy ? 'default' : 'pointer', opacity: freezeBusy ? 0.5 : 1 }}>
          {freezeBusy ? 'Freezing…' : 'Use a streak freeze'}
        </button>
      </div>

      <Section title="Privacy">
        <LeaderboardOptIn
          enabled={!!kid.global_leaderboard_opt_in}
          busy={leaderboardBusy}
          onToggle={toggleLeaderboard}
        />
      </Section>

      <Section title="Activity">
        {timeline.length === 0 ? (
          <Empty>Nothing yet — activity shows up here as soon as {kid.display_name} starts reading.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {timeline.map((ev, i) => (
              <TimelineRow key={i} event={ev} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Upcoming expert sessions">
        {upcoming.length === 0 ? (
          <Empty>No sessions scheduled right now.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map(s => (
              <a
                key={s.id}
                href={`/kids/expert-sessions/${s.id}`}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '10px 12px', textDecoration: 'none', color: C.text,
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>
                    {s.categories?.name ? `${s.categories.name} · ` : ''}
                    {new Date(s.scheduled_at).toLocaleString()}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: C.dim }}>View →</span>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent quiz attempts">
        {stats.recentAttempts?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.recentAttempts.map(a => (
              <div key={`${a.article_id}:${a.attempt_number}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.text, display: 'flex', justifyContent: 'space-between' }}>
                <span>Attempt #{a.attempt_number}</span>
                <span style={{ color: a.correct >= 3 ? C.success : C.danger, fontWeight: 700 }}>{a.correct}/5</span>
                <span style={{ color: C.dim }}>{new Date(a.at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : <Empty>No quiz activity yet.</Empty>}
      </Section>

      <Section title="Achievements">
        {stats.achievements?.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {stats.achievements.map(a => (
              <Badge
                key={a.id}
                name={a.achievements?.display_name || a.achievements?.key || 'Badge'}
              />
            ))}
          </div>
        ) : <Empty>Nothing earned yet.</Empty>}
      </Section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: C.dim, margin: '0 0 8px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 13, color: C.dim }}>{children}</div>;
}

function LeaderboardOptIn({ enabled, busy, onToggle }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          Show on global leaderboard
        </div>
        <div style={{ fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
          Off by default. Let other kids on Verity Post see your kid&rsquo;s first name and score on the kids-only global board.
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        aria-pressed={enabled}
        style={{
          minWidth: 88, padding: '8px 16px',
          borderRadius: 999,
          border: `1px solid ${enabled ? C.success : C.border}`,
          background: enabled ? C.success : 'transparent',
          color: enabled ? '#fff' : C.text,
          fontSize: 13, fontWeight: 700,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >{busy ? '…' : enabled ? 'On' : 'Off'}</button>
    </div>
  );
}

const KIND_META = {
  read: { label: 'Read', bg: '#dbeafe', fg: '#1d4ed8' },
  quiz_pass: { label: 'Quiz', bg: '#dcfce7', fg: '#15803d' },
  badge: { label: 'Badge', bg: '#fef3c7', fg: '#b45309' },
  question: { label: 'Ask', bg: '#ede9fe', fg: '#6d28d9' },
};

function TimelineRow({ event }) {
  const meta = KIND_META[event.kind] || KIND_META.read;
  const body = (
    <>
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
        padding: '2px 8px', borderRadius: 999,
        background: meta.bg, color: meta.fg,
        flex: '0 0 auto',
      }}>{meta.label}</span>
      <span style={{ fontSize: 13, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.label}</span>
      <span style={{ fontSize: 11, color: C.dim, flex: '0 0 auto' }}>{timeAgo(event.at)}</span>
    </>
  );
  const style = {
    display: 'flex', alignItems: 'center', gap: 10,
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '8px 12px',
    textDecoration: 'none', color: 'inherit',
  };
  return event.href
    ? <a href={event.href} style={style}>{body}</a>
    : <div style={style}>{body}</div>;
}
