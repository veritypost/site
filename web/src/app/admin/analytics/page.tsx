'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import StatCard from '@/components/admin/StatCard';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/admin/Button';
import NumberInput from '@/components/admin/NumberInput';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type ArticleRow = Tables<'articles'>;

type QuizFailure = {
  id: string;
  story: string;
  question: string;
  failRate: number;
  attempts: number;
  flagged: boolean;
};

const RESOURCE_USAGE = [
  { resource: 'Supabase Database', used: '45 MB', limit: '500 MB', pct: 9 },
  { resource: 'Supabase Bandwidth', used: '1.2 GB', limit: '5 GB', pct: 24 },
  { resource: 'Realtime Connections', used: '34', limit: '200', pct: 17 },
  { resource: 'Edge Functions', used: '12K', limit: '500K', pct: 2 },
  { resource: 'Vercel Invocations', used: '28K', limit: '100K', pct: 28 },
  { resource: 'Vercel Bandwidth', used: '8.2 GB', limit: '100 GB', pct: 8 },
];

function AnalyticsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'stories' | 'quizzes' | 'resources'>('overview');
  const [, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [quizSort, setQuizSort] = useState<'failRate' | 'attempts' | 'flagged'>('failRate');
  const [failRedThreshold, setFailRedThreshold] = useState(40);
  const [failYellowThreshold, setFailYellowThreshold] = useState(25);
  const [resourceWarnPct, setResourceWarnPct] = useState(50);
  const [resourceDangerPct, setResourceDangerPct] = useState(80);

  const [totalUsers, setTotalUsers] = useState(0);
  const [totalStories, setTotalStories] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [totalReadingHistory, setTotalReadingHistory] = useState(0);
  const [topStories, setTopStories] = useState<ArticleRow[]>([]);
  const [quizFailures, setQuizFailures] = useState<QuizFailure[]>([]);
  const [dailyStats, setDailyStats] = useState<Array<{ day: string; views: number; users: number }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles!fk_user_roles_role_id(name)').eq('user_id', user.id);
      const roleNames = (
        (userRoles || []) as Array<{ roles: { name: string | null } | null }>
      )
        .map((r) => r.roles?.name)
        .filter((n): n is string => typeof n === 'string');
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) { router.push('/'); return; }

      const [userRes, storyRes, commentRes, readingRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('articles').select('id', { count: 'exact', head: true }),
        supabase.from('comments').select('id', { count: 'exact', head: true }),
        supabase.from('reading_log').select('id', { count: 'exact', head: true }),
      ]);
      setTotalUsers(userRes.count || 0);
      setTotalStories(storyRes.count || 0);
      setTotalComments(commentRes.count || 0);
      setTotalReadingHistory(readingRes.count || 0);

      const { data: storiesData } = await supabase
        .from('articles')
        .select('id, title, view_count, comment_count')
        .order('view_count', { ascending: false })
        .limit(10);
      setTopStories((storiesData || []) as ArticleRow[]);

      const { data: quizData } = await supabase
        .from('quizzes')
        .select('id, article_id, title, options, articles(title)')
        .limit(20);
      const { data: resultsData, error: resultsErr } = await supabase
        .from('quiz_attempts')
        .select('quiz_id, is_correct');
      if (resultsErr) setLoadError(resultsErr.message);
      const resultsByQuiz: Record<string, { total: number; failed: number }> = {};
      type AttemptRow = { quiz_id: string | null; is_correct: boolean | null };
      ((resultsData || []) as AttemptRow[]).forEach((r) => {
        const id = r.quiz_id;
        if (!id) return;
        if (!resultsByQuiz[id]) resultsByQuiz[id] = { total: 0, failed: 0 };
        resultsByQuiz[id].total++;
        if (!r.is_correct) resultsByQuiz[id].failed++;
      });
      type QuizRow = {
        id: string;
        article_id: string | null;
        title: string | null;
        options: unknown;
        articles: { title: string | null } | null;
      };
      setQuizFailures(((quizData || []) as QuizRow[]).map((q) => {
        const stats = resultsByQuiz[q.id] || { total: 0, failed: 0 };
        const failRate = stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0;
        return {
          id: q.id,
          story: q.articles?.title || q.article_id || '',
          question: q.title || 'Quiz',
          failRate,
          attempts: stats.total,
          flagged: false,
        };
      }).sort((a, b) => b.failRate - a.failRate));

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
      const { data: historyData } = await supabase
        .from('reading_log')
        .select('created_at, user_id')
        .gte('created_at', sevenDaysAgo.toISOString());
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayMap: Record<string, { views: number; users: Set<string> }> = {};
      type HistoryRow = { created_at: string | null; user_id: string | null };
      ((historyData || []) as HistoryRow[]).forEach((h) => {
        if (!h.created_at) return;
        const d = days[new Date(h.created_at).getDay()];
        if (!dayMap[d]) dayMap[d] = { views: 0, users: new Set() };
        dayMap[d].views++;
        if (h.user_id) dayMap[d].users.add(h.user_id);
      });
      setDailyStats(days.map((d) => ({
        day: d,
        views: dayMap[d]?.views || 0,
        users: dayMap[d]?.users.size || 0,
      })));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalViews = dailyStats.reduce((a, d) => a + d.views, 0);
  const totalUniqueUsers = dailyStats.reduce((a, d) => a + d.users, 0);
  const maxViews = Math.max(...dailyStats.map((d) => d.views), 1);

  const totalAttempts = quizFailures.reduce((a, q) => a + q.attempts, 0);
  const totalFailed = quizFailures.reduce((a, q) => a + Math.round(q.attempts * q.failRate / 100), 0);
  const avgQuizPassRate = totalAttempts > 0
    ? Math.round(((totalAttempts - totalFailed) / totalAttempts) * 100) : 0;

  const sortedQuizFailures = [...quizFailures].sort((a, b) => {
    if (quizSort === 'failRate') return b.failRate - a.failRate;
    if (quizSort === 'attempts') return b.attempts - a.attempts;
    return (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0);
  });

  const flagQuestion = (id: string) => {
    setQuizFailures((prev) => prev.map((q) => q.id === id ? { ...q, flagged: true } : q));
    push({ message: 'Flagged for review', variant: 'warn' });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="Analytics"
        subtitle="Traffic, engagement, quiz quality, and resource usage."
        actions={
          // TODO: 30d/90d options hidden — fetch currently hardcodes 7 days.
          // Re-enable once the fetch reads the selected period.
          <div style={{ display: 'flex', gap: S[1] }}>
            <Button size="sm" variant="primary" onClick={() => setPeriod('7d')}>7d</Button>
          </div>
        }
      />

      {loadError && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>Failed to load analytics: {loadError}</div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: S[3],
        marginBottom: S[6],
      }}>
        <StatCard label="Total users" value={totalUsers.toLocaleString()} />
        <StatCard label="Total articles" value={totalStories.toLocaleString()} />
        <StatCard label="Total comments" value={totalComments.toLocaleString()} />
        <StatCard
          label="Avg quiz pass"
          value={`${avgQuizPassRate}%`}
          trend={avgQuizPassRate > 75 ? 'up' : 'down'}
        />
      </div>

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {([
          { k: 'overview', l: 'Traffic' },
          { k: 'stories', l: 'Top articles' },
          { k: 'quizzes', l: 'Quiz failures' },
          { k: 'resources', l: 'Resources' },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: `${S[2]}px ${S[4]}px`, borderRadius: 8,
              border: `1px solid ${tab === t.k ? C.accent : C.divider}`,
              background: tab === t.k ? C.hover : 'transparent',
              color: tab === t.k ? C.white : C.soft,
              fontSize: F.sm, fontWeight: tab === t.k ? 600 : 500,
              cursor: 'pointer', font: 'inherit',
            }}
          >{t.l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <PageSection title="Daily reads (last 7 days)" boxed>
          {totalViews === 0 ? (
            <div style={{ padding: S[8], textAlign: 'center', color: C.muted, fontSize: F.sm }}>
              No reading data for this period
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: S[2], height: 140 }}>
                {dailyStats.map((d) => (
                  <div key={d.day} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                    <div style={{
                      height: `${(d.views / maxViews) * 120}px`,
                      background: `linear-gradient(to top, ${C.accent}, ${C.accent}66)`,
                      borderRadius: '4px 4px 0 0',
                      marginBottom: S[1],
                      transition: 'height 300ms ease',
                    }} />
                    <div style={{ fontSize: F.xs, color: C.dim }}>{d.day}</div>
                    <div style={{ fontSize: F.xs, fontWeight: 600, color: C.white }}>
                      {d.views >= 1000 ? `${(d.views / 1000).toFixed(1)}K` : d.views}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: S[4], fontSize: F.sm, color: C.dim }}>
                {totalViews.toLocaleString()} total reads · {totalUniqueUsers.toLocaleString()} unique readers · {totalReadingHistory.toLocaleString()} all-time reads
              </div>
            </>
          )}
        </PageSection>
      )}

      {tab === 'stories' && (
        <PageSection title="Top articles">
          <DataTable
            columns={[
              {
                key: 'rank', header: '#', sortable: false, width: 40,
                render: (_r: ArticleRow, _i?: number) => '',
              },
              { key: 'title', header: 'Title', truncate: true },
              {
                key: 'view_count', header: 'Views', align: 'right' as const,
                render: (r: ArticleRow) => (r.view_count ?? 0) >= 1000 ? `${((r.view_count ?? 0) / 1000).toFixed(1)}K` : (r.view_count ?? 0),
              },
              { key: 'comment_count', header: 'Comments', align: 'right' as const },
            ]}
            rows={topStories.map((s, i) => ({ ...s, rank: i + 1 }))}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No articles yet" description="Published articles appear here ranked by views." />}
          />
        </PageSection>
      )}

      {tab === 'quizzes' && (
        <PageSection title="Quiz failures" description="High fail rates may indicate unclear wording, ambiguous options, or content errors.">
          <div style={{
            display: 'flex', gap: S[4], alignItems: 'center', flexWrap: 'wrap',
            padding: S[3], marginBottom: S[3], borderRadius: 8, border: `1px solid ${C.divider}`, background: C.bg,
          }}>
            <div>
              <label style={lblStyle}>Red threshold</label>
              <NumberInput block={false} style={{ width: 80 }} value={failRedThreshold}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFailRedThreshold(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lblStyle}>Yellow threshold</label>
              <NumberInput block={false} style={{ width: 80 }} value={failYellowThreshold}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFailYellowThreshold(parseInt(e.target.value) || 0)} />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: S[1] }}>
              {([
                { k: 'failRate', l: 'Fail rate' },
                { k: 'attempts', l: 'Attempts' },
                { k: 'flagged', l: 'Flagged' },
              ] as const).map((s) => (
                <Button
                  key={s.k}
                  size="sm"
                  variant={quizSort === s.k ? 'primary' : 'secondary'}
                  onClick={() => setQuizSort(s.k)}
                >{s.l}</Button>
              ))}
            </div>
          </div>

          {sortedQuizFailures.length === 0 ? (
            <EmptyState title="No quiz data" description="Quiz attempts haven't been recorded yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {sortedQuizFailures.map((q) => {
                const failColor =
                  q.failRate > failRedThreshold ? C.danger :
                  q.failRate > failYellowThreshold ? C.warn : C.success;
                return (
                  <div key={q.id} style={{
                    padding: S[3], borderRadius: 8,
                    background: C.bg, border: `1px solid ${q.flagged ? C.warn : C.divider}`,
                  }}>
                    <div style={{ display: 'flex', gap: S[2], marginBottom: S[1], alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: F.xs, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {q.story}
                      </span>
                      {q.flagged && <Badge variant="warn" size="xs">Flagged</Badge>}
                      <span style={{ fontSize: F.xs, color: C.muted }}>{q.attempts} attempts</span>
                    </div>
                    <div style={{ fontSize: F.base, fontWeight: 600, marginBottom: S[2], color: C.white }}>{q.question}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[2] }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.card, overflow: 'hidden' }}>
                        <div style={{ height: 6, background: failColor, width: `${q.failRate}%`, transition: 'width 200ms' }} />
                      </div>
                      <span style={{ fontSize: F.md, fontWeight: 700, color: failColor, minWidth: 40, textAlign: 'right' }}>{q.failRate}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                      {!q.flagged && <Button size="sm" variant="secondary" onClick={() => flagQuestion(q.id)}>Flag for review</Button>}
                      {/* TODO: quiz edit UI not wired here — edit in /admin/story-manager */}
                      <Button size="sm" variant="ghost" disabled title="Edit quiz questions in /admin/story-manager">Edit question</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PageSection>
      )}

      {tab === 'resources' && (
        <PageSection title="Resource usage">
          <div style={{
            padding: S[3], marginBottom: S[3], borderRadius: 8,
            background: 'rgba(234,179,8,0.08)', border: `1px solid ${C.warn}`,
            color: C.warn, fontSize: F.sm, fontWeight: 600,
          }}>
            [Demo data] These figures are placeholders. Live Supabase / Vercel usage wiring is pending — do not use for capacity decisions.
          </div>
          <div style={{
            display: 'flex', gap: S[4], alignItems: 'center', flexWrap: 'wrap',
            padding: S[3], marginBottom: S[3], borderRadius: 8, border: `1px solid ${C.divider}`, background: C.bg,
          }}>
            <div>
              <label style={lblStyle}>Warning at</label>
              <NumberInput block={false} style={{ width: 80 }} value={resourceWarnPct}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setResourceWarnPct(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lblStyle}>Danger at</label>
              <NumberInput block={false} style={{ width: 80 }} value={resourceDangerPct}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setResourceDangerPct(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {RESOURCE_USAGE.map((r) => {
              const color =
                r.pct > resourceDangerPct ? C.danger :
                r.pct > resourceWarnPct ? C.warn : C.success;
              return (
                <div key={r.resource} style={{
                  padding: S[3], borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.divider}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: S[1], gap: S[2], flexWrap: 'wrap' }}>
                    <span style={{ fontSize: F.base, fontWeight: 500, color: C.white }}>{r.resource}</span>
                    <span style={{ fontSize: F.sm, color: C.dim }}>{r.used} / {r.limit}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.card }}>
                    <div style={{ height: 6, borderRadius: 3, background: color, width: `${r.pct}%`, transition: 'width 300ms' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{
            marginTop: S[3], padding: S[3], background: C.card, border: `1px solid ${C.divider}`,
            borderRadius: 8, fontSize: F.sm, color: C.dim, lineHeight: 1.5,
          }}>
            Free-tier limits shown. Upgrade Supabase or Vercel when any bar passes your danger threshold.
          </div>
        </PageSection>
      )}
    </Page>
  );
}

const lblStyle: React.CSSProperties = {
  display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
  color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function AnalyticsAdmin() {
  return (
    <ToastProvider>
      <AnalyticsInner />
    </ToastProvider>
  );
}
