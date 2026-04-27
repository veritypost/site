// @migrated-to-permissions 2026-04-18
// @feature-verified family_admin 2026-04-18
'use client';
import { useState, useEffect, CSSProperties, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import Badge from '@/components/kids/Badge';
import PairDeviceButton from '@/components/kids/PairDeviceButton';
import OpenKidsAppButton from '@/components/kids/OpenKidsAppButton';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';
import { formatDate, formatDateTime } from '@/lib/dates';

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `success`/`warn`/`danger` keep inline hex (deeper variants than canonical).
const C = {
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: '#16a34a',
  warn: '#b45309',
  danger: '#dc2626',
} as const;

type KidRow = Tables<'kid_profiles'>;
type QuizAttemptRow = Pick<
  Tables<'quiz_attempts'>,
  'article_id' | 'attempt_number' | 'is_correct' | 'created_at'
>;
type AchievementRow = Pick<Tables<'user_achievements'>, 'id' | 'earned_at'> & {
  achievements?: Pick<Tables<'achievements'>, 'key' | 'name' | 'icon_name'> | null;
};
type ReadingRow = Pick<Tables<'reading_log'>, 'id' | 'created_at' | 'completed'> & {
  articles?: Pick<Tables<'articles'>, 'title' | 'slug'> | null;
};
type QuestionRow = Pick<Tables<'kid_expert_questions'>, 'id' | 'created_at' | 'question_text'> & {
  kid_expert_sessions?: Pick<Tables<'kid_expert_sessions'>, 'title'> | null;
};
type SessionRow = Pick<
  Tables<'kid_expert_sessions'>,
  'id' | 'title' | 'scheduled_at' | 'duration_minutes'
> & {
  categories?: Pick<Tables<'categories'>, 'name'> | null;
};

type AttemptSummary = {
  article_id: string;
  attempt_number: number;
  at: string;
  correct: number;
};

type StatsState = {
  reads7d: number;
  quizzesTotal: number;
  recentAttempts: AttemptSummary[];
  achievements: AchievementRow[];
};

type TimelineEvent = {
  kind: 'read' | 'quiz_pass' | 'badge' | 'question';
  at: string;
  label: string;
  href?: string | null;
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

export default function KidDashboardPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [kid, setKid] = useState<KidRow | null>(null);
  const [stats, setStats] = useState<StatsState>({
    reads7d: 0,
    quizzesTotal: 0,
    recentAttempts: [],
    achievements: [],
  });
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [upcoming, setUpcoming] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string>('');
  const [flash, setFlash] = useState<string>('');
  const [freezeBusy, setFreezeBusy] = useState<boolean>(false);
  const [pauseBusy, setPauseBusy] = useState<boolean>(false);
  const [leaderboardBusy, setLeaderboardBusy] = useState<boolean>(false);
  const [denied, setDenied] = useState<boolean>(false);
  const [canUseFreeze, setCanUseFreeze] = useState<boolean>(false);
  const [canToggleLeaderboard, setCanToggleLeaderboard] = useState<boolean>(false);

  async function load() {
    setError('');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
      return;
    }

    await refreshAllPermissions();
    await refreshIfStale();
    if (!hasPermission('kids.parent.view')) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setCanUseFreeze(hasPermission('kids.streak.freeze.use'));
    setCanToggleLeaderboard(hasPermission('kids.parent.global_leaderboard_opt_in'));

    const { data: k } = await supabase.from('kid_profiles').select('*').eq('id', id).maybeSingle();
    if (!k || k.parent_user_id !== user.id) {
      router.push('/profile/kids');
      return;
    }
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
      supabase
        .from('reading_log')
        .select('id', { count: 'exact', head: true })
        .eq('kid_profile_id', id)
        .gte('created_at', since7d),
      supabase
        .from('quiz_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('kid_profile_id', id),
      supabase
        .from('quiz_attempts')
        .select('article_id, attempt_number, is_correct, created_at')
        .eq('kid_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('user_achievements')
        .select('id, earned_at, achievements(key, name, icon_name)')
        .eq('kid_profile_id', id)
        .order('earned_at', { ascending: false })
        .limit(20),
      supabase
        .from('reading_log')
        .select('id, created_at, completed, articles(title, slug)')
        .eq('kid_profile_id', id)
        .eq('completed', true)
        .gte('created_at', since30d)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('kid_expert_questions')
        .select('id, created_at, question_text, kid_expert_sessions(title)')
        .eq('kid_profile_id', id)
        .gte('created_at', since30d)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('kid_expert_sessions')
        .select('id, title, scheduled_at, duration_minutes, categories(name)')
        .gte('scheduled_at', new Date().toISOString())
        .eq('is_active', true)
        .order('scheduled_at', { ascending: true })
        .limit(5),
    ]);

    const byAttempt: Record<string, AttemptSummary> = {};
    for (const a of (recentAttempts as QuizAttemptRow[] | null) || []) {
      const key = `${a.article_id}:${a.attempt_number}`;
      if (!byAttempt[key])
        byAttempt[key] = {
          article_id: a.article_id as string,
          attempt_number: a.attempt_number,
          at: a.created_at,
          correct: 0,
        };
      if (a.is_correct) byAttempt[key].correct += 1;
    }
    const attemptSummaries = Object.values(byAttempt);

    setStats({
      reads7d: reads7d || 0,
      quizzesTotal: quizzesTotal || 0,
      recentAttempts: attemptSummaries.slice(0, 8),
      achievements: (achievements as AchievementRow[]) || [],
    });

    const events: TimelineEvent[] = [];
    for (const r of (readingTimeline as ReadingRow[] | null) || []) {
      events.push({
        kind: 'read',
        at: r.created_at,
        label: r.articles?.title || 'Article',
        href: null,
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
    for (const ach of (achievements as AchievementRow[] | null) || []) {
      events.push({
        kind: 'badge',
        at: ach.earned_at || '',
        label: `Earned badge: ${ach.achievements?.name || ach.achievements?.key || 'Badge'}`,
      });
    }
    for (const q of (questionTimeline as QuestionRow[] | null) || []) {
      events.push({
        kind: 'question',
        at: q.created_at,
        label: `Asked in \u201C${q.kid_expert_sessions?.title || 'expert session'}\u201D`,
      });
    }
    events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    setTimeline(events.slice(0, 25));

    setUpcoming((sessions as SessionRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function useFreeze() {
    if (freezeBusy) return;
    setFreezeBusy(true);
    setError('');
    setFlash('');
    try {
      const res = await fetch(`/api/kids/${id}/streak-freeze`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Freeze failed');
        return;
      }
      setFlash(`Streak freeze used. ${data.remaining}/${data.cap} left this week.`);
      load();
    } finally {
      setFreezeBusy(false);
    }
  }

  async function togglePause() {
    if (!kid || pauseBusy) return;
    setPauseBusy(true);
    setError('');
    setFlash('');
    const nextPaused = !kid.paused_at;
    try {
      const res = await fetch(`/api/kids/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Could not change pause state');
        return;
      }
      setFlash(nextPaused ? 'Paused. Kid surfaces are hidden until you resume.' : 'Resumed.');
      load();
    } finally {
      setPauseBusy(false);
    }
  }

  async function toggleLeaderboard() {
    if (!kid || leaderboardBusy) return;
    setLeaderboardBusy(true);
    setError('');
    setFlash('');
    const next = !kid.global_leaderboard_opt_in;
    try {
      const res = await fetch(`/api/kids/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ global_leaderboard_opt_in: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Could not change leaderboard setting');
        return;
      }
      setFlash(
        next
          ? `${kid.display_name} will appear on the global leaderboard.`
          : `${kid.display_name} is off the global leaderboard.`
      );
      load();
    } finally {
      setLeaderboardBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading{'\u2026'}</div>;
  if (denied) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Kid dashboard</h1>
        <p style={{ fontSize: 14, color: C.dim, marginBottom: 18 }}>
          This dashboard is part of the Verity Family plan.
        </p>
        <a
          href="/profile/settings#billing"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 9,
            background: C.accent,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Upgrade to Family
        </a>
      </div>
    );
  }
  if (!kid) return null;

  const paused = !!kid.paused_at;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/profile/kids" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>
        &larr; All kids
      </a>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 16 }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: kid.avatar_color || C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {(kid.display_name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{kid.display_name}</h1>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            Score {kid.verity_score || 0} &middot; Streak {kid.streak_current || 0}
            {(kid.metadata as { trial?: boolean } | null)?.trial ? ' · Trial' : ''}
            {paused ? ' · Paused' : ''}
          </div>
        </div>
        <button
          onClick={togglePause}
          disabled={pauseBusy}
          style={{
            padding: '8px 14px',
            borderRadius: 9,
            border: `1px solid ${paused ? C.success : C.border}`,
            background: paused ? C.success : 'transparent',
            color: paused ? '#fff' : C.text,
            fontSize: 13,
            fontWeight: 700,
            cursor: pauseBusy ? 'default' : 'pointer',
            opacity: pauseBusy ? 0.5 : 1,
          }}
        >
          {pauseBusy ? '\u2026' : paused ? 'Resume access' : 'Pause access'}
        </button>
      </div>

      {flash && (
        <div
          style={{
            background: '#ecfdf5',
            border: `1px solid ${C.success}`,
            color: C.success,
            borderRadius: 10,
            padding: 10,
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          {flash}
        </div>
      )}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: `1px solid ${C.danger}`,
            color: C.danger,
            borderRadius: 10,
            padding: 10,
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}

      {/* Phase 5 of AI + Plan Change Implementation: band-advance + graduation panel. */}
      <BandPanel
        kid={kid}
        kidId={id}
        onAdvanced={(msg) => {
          setFlash(msg);
          load();
        }}
        onError={(msg) => setError(msg)}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Stat label="Reads (7d)" value={stats.reads7d} />
        <Stat label="Quizzes total" value={stats.quizzesTotal} />
        <Stat label="Best streak" value={kid.streak_best || 0} />
        <Stat label="Freezes this week" value={kid.streak_freeze_remaining ?? '\u2014'} />
      </div>

      {canUseFreeze && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={useFreeze}
            disabled={freezeBusy}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: 'transparent',
              fontSize: 12,
              fontWeight: 600,
              cursor: freezeBusy ? 'default' : 'pointer',
              opacity: freezeBusy ? 0.5 : 1,
            }}
          >
            {freezeBusy ? 'Freezing\u2026' : 'Use a streak freeze'}
          </button>
        </div>
      )}

      {canToggleLeaderboard && (
        <Section title="Privacy">
          <LeaderboardOptIn
            enabled={!!kid.global_leaderboard_opt_in}
            busy={leaderboardBusy}
            onToggle={toggleLeaderboard}
          />
        </Section>
      )}

      <Section title="Pair a device">
        <PairDeviceButton kidId={id} />
      </Section>

      <Section title="Open Kids App">
        <OpenKidsAppButton />
      </Section>

      <Section title="Activity">
        {timeline.length === 0 ? (
          <Empty>
            Nothing yet &mdash; activity shows up here as soon as {kid.display_name} starts reading.
          </Empty>
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
            {upcoming.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: C.text,
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>
                    {s.categories?.name ? `${s.categories.name} \u00b7 ` : ''}
                    {formatDateTime(s.scheduled_at)}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: C.dim }}>In the Kids app</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent quiz attempts">
        {stats.recentAttempts.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.recentAttempts.map((a) => (
              <div
                key={`${a.article_id}:${a.attempt_number}`}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: C.text,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Attempt #{a.attempt_number}</span>
                <span style={{ color: a.correct >= 3 ? C.success : C.danger, fontWeight: 700 }}>
                  {a.correct}/5
                </span>
                <span style={{ color: C.dim }}>{formatDate(a.at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No quiz activity yet.</Empty>
        )}
      </Section>

      <Section title="Achievements">
        {stats.achievements.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {stats.achievements.map((a) => (
              <Badge key={a.id} name={a.achievements?.name || a.achievements?.key || 'Badge'} />
            ))}
          </div>
        ) : (
          <Empty>Nothing earned yet.</Empty>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: C.dim,
          margin: '0 0 8px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, color: C.dim }}>{children}</div>;
}

function LeaderboardOptIn({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          Show on global leaderboard
        </div>
        <div style={{ fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
          Off by default. Let other kids on Verity Post see your kid&rsquo;s first name and score on
          the kids-only global board.
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        aria-pressed={enabled}
        style={{
          minWidth: 88,
          padding: '8px 16px',
          borderRadius: 999,
          border: `1px solid ${enabled ? C.success : C.border}`,
          background: enabled ? C.success : 'transparent',
          color: enabled ? '#fff' : C.text,
          fontSize: 13,
          fontWeight: 700,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? '\u2026' : enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}

const KIND_META: Record<TimelineEvent['kind'], { label: string; bg: string; fg: string }> = {
  read: { label: 'Read', bg: '#dbeafe', fg: '#1d4ed8' },
  quiz_pass: { label: 'Quiz', bg: '#dcfce7', fg: '#15803d' },
  badge: { label: 'Badge', bg: '#fef3c7', fg: '#b45309' },
  question: { label: 'Ask', bg: '#ede9fe', fg: '#6d28d9' },
};

function TimelineRow({ event }: { event: TimelineEvent }) {
  const meta = KIND_META[event.kind] || KIND_META.read;
  const body = (
    <>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          padding: '2px 8px',
          borderRadius: 999,
          background: meta.bg,
          color: meta.fg,
          flex: '0 0 auto',
        }}
      >
        {meta.label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: C.text,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {event.label}
      </span>
      <span style={{ fontSize: 11, color: C.dim, flex: '0 0 auto' }}>{timeAgo(event.at)}</span>
    </>
  );
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '8px 12px',
    textDecoration: 'none',
    color: 'inherit',
  };
  return event.href ? (
    <a href={event.href} style={style}>
      {body}
    </a>
  ) : (
    <div style={style}>{body}</div>
  );
}

// ---------------------------------------------------------------------------
// Phase 5 — Band-advance + graduation panel
// ---------------------------------------------------------------------------

function BandPanel({
  kid,
  kidId,
  onAdvanced,
  onError,
}: {
  kid: KidRow;
  kidId: string;
  onAdvanced: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<'tweens' | 'graduated' | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);

  const band = kid.reading_band || 'kids';
  const promptAt = kid.birthday_prompt_at;
  const promptKind: 'tweens' | 'graduated' | null =
    promptAt && band === 'kids' ? 'tweens' : promptAt && band === 'tweens' ? 'graduated' : null;

  const submit = async (target: 'tweens' | 'graduated') => {
    setBusy(true);
    onError('');
    try {
      const body: Record<string, unknown> = { to: target };
      if (target === 'graduated') body.email = email.trim().toLowerCase();
      const res = await fetch(`/api/kids/${kidId}/advance-band`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(j.error || `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      if (target === 'tweens') {
        onAdvanced('Reading band advanced to Tweens.');
        setConfirmAction(null);
      } else {
        // Graduation returned a one-time claim URL. Show it to the parent;
        // they pass it to the kid (or the kid claims via email link in
        // the email template that ships in Phase 6).
        setClaimUrl(j.claim_url || null);
        onAdvanced('Graduation token issued. Share the claim link with your kid.');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const cardStyle: CSSProperties = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  };

  if (claimUrl) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Graduation claim link</div>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
          Share this single-use link with your child. It expires in 24 hours. They&apos;ll set their
          adult-account password when they claim it.
        </div>
        <div
          style={{
            background: 'var(--bg)',
            border: `1px solid ${C.border}`,
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            marginBottom: 10,
          }}
        >
          {claimUrl}
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(claimUrl);
          }}
          style={{
            padding: '6px 12px',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Copy link
        </button>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Reading band: <span style={{ textTransform: 'capitalize' }}>{band}</span>
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            {band === 'kids' && 'Ages 7-9. Move to Tweens (10-12) when ready.'}
            {band === 'tweens' && 'Ages 10-12. Graduate to the adult app at 13.'}
            {band === 'graduated' && 'Graduated. This profile is retired.'}
          </div>
        </div>
        {band === 'kids' && (
          <button
            onClick={() => setConfirmAction('tweens')}
            style={{
              padding: '8px 14px',
              borderRadius: 9,
              border: `1px solid ${C.accent}`,
              background: 'transparent',
              color: C.accent,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Advance to Tweens
          </button>
        )}
        {band === 'tweens' && (
          <button
            onClick={() => setConfirmAction('graduated')}
            style={{
              padding: '8px 14px',
              borderRadius: 9,
              border: `1px solid ${C.accent}`,
              background: 'transparent',
              color: C.accent,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Move to adult app
          </button>
        )}
      </div>

      {promptKind && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: '#fef3c7',
            border: '1px solid #b45309',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          🎂 Birthday milestone reached. Time to{' '}
          {promptKind === 'tweens' ? 'advance to Tweens' : 'graduate to the adult app'}.
        </div>
      )}

      {confirmAction === 'tweens' && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Advance to Tweens?</div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
            Your child will see articles for ages 10-12. <strong>This cannot be undone.</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => submit('tweens')}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: C.accent,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {busy ? 'Advancing…' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'transparent',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmAction === 'graduated' && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Move to the adult app?
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
              <li>Kid profile retires permanently (cannot be undone).</li>
              <li>New adult account created on your family plan.</li>
              <li>Reading history, streaks, and quiz scores will not carry over.</li>
              <li>Category preferences carry over.</li>
              <li>You&apos;ll get a one-time claim link to share with your child.</li>
            </ul>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email for the new adult account"
            style={{
              width: '100%',
              padding: 8,
              fontSize: 13,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              boxSizing: 'border-box',
              marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => submit('graduated')}
              disabled={busy || !email.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: C.accent,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: busy || !email.trim() ? 'default' : 'pointer',
                opacity: busy || !email.trim() ? 0.5 : 1,
              }}
            >
              {busy ? 'Issuing token…' : 'Confirm graduation'}
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'transparent',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
