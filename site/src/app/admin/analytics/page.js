'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const RESOURCE_USAGE = [
  { resource: 'Supabase Database', used: '45 MB', limit: '500 MB', pct: 9 },
  { resource: 'Supabase Bandwidth', used: '1.2 GB', limit: '5 GB', pct: 24 },
  { resource: 'Realtime Connections', used: '34', limit: '200', pct: 17 },
  { resource: 'Edge Functions', used: '12K', limit: '500K', pct: 2 },
  { resource: 'Vercel Invocations', used: '28K', limit: '100K', pct: 28 },
  { resource: 'Vercel Bandwidth', used: '8.2 GB', limit: '100 GB', pct: 8 },
];

const numStyle = { width: 50, padding: '4px 6px', borderRadius: 4, border: '1px solid #222222', background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

export default function AnalyticsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('7d');
  const [quizSort, setQuizSort] = useState('failRate');
  const [failRedThreshold, setFailRedThreshold] = useState(40);
  const [failYellowThreshold, setFailYellowThreshold] = useState(25);
  const [resourceWarnPct, setResourceWarnPct] = useState(50);
  const [resourceDangerPct, setResourceDangerPct] = useState(80);

  // Data from Supabase
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalStories, setTotalStories] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [totalReadingHistory, setTotalReadingHistory] = useState(0);
  const [topStories, setTopStories] = useState([]);
  const [quizFailures, setQuizFailures] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);

  useEffect(() => {
    async function init() {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      // Role check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) {
        router.push('/');
        return;
      }

      // Aggregate counts
      const [
        { count: userCount },
        { count: storyCount },
        { count: commentCount },
        { count: readingCount },
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('articles').select('id', { count: 'exact', head: true }),
        supabase.from('comments').select('id', { count: 'exact', head: true }),
        supabase.from('reading_log').select('id', { count: 'exact', head: true }),
      ]);

      setTotalUsers(userCount || 0);
      setTotalStories(storyCount || 0);
      setTotalComments(commentCount || 0);
      setTotalReadingHistory(readingCount || 0);

      // Top stories by view count
      const { data: storiesData } = await supabase
        .from('articles')
        .select('id, title, view_count, comment_count')
        .order('view_count', { ascending: false })
        .limit(10);
      setTopStories(storiesData || []);

      // Quiz stats — aggregate from quiz_results per quiz
      const { data: quizData } = await supabase
        .from('quizzes')
        .select('id, article_id, title, options, articles(title)')
        .limit(20);
      const { data: resultsData } = await supabase
        .from('quiz_attempts')
        .select('quiz_id, passed');
      const resultsByQuiz = {};
      (resultsData || []).forEach(r => {
        if (!resultsByQuiz[r.quiz_id]) resultsByQuiz[r.quiz_id] = { total: 0, failed: 0 };
        resultsByQuiz[r.quiz_id].total++;
        if (!r.passed) resultsByQuiz[r.quiz_id].failed++;
      });
      setQuizFailures((quizData || []).map(q => {
        const stats = resultsByQuiz[q.id] || { total: 0, failed: 0 };
        const failRate = stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0;
        return {
          id: q.id,
          story: q.articles?.title || q.article_id,
          question: q.title || 'Quiz',
          failRate,
          attempts: stats.total,
          pattern: null,
          flagged: false,
        };
      }).sort((a, b) => b.failRate - a.failRate));

      // Daily stats from reading_history (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: historyData } = await supabase
        .from('reading_log')
        .select('created_at, user_id')
        .gte('created_at', sevenDaysAgo.toISOString());

      // Group by day of week
      const dayMap = {};
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      (historyData || []).forEach(h => {
        const d = days[new Date(h.created_at).getDay()];
        if (!dayMap[d]) dayMap[d] = { views: 0, users: new Set() };
        dayMap[d].views++;
        dayMap[d].users.add(h.user_id);
      });
      const built = days.map(d => ({
        day: d,
        views: dayMap[d]?.views || 0,
        users: dayMap[d]?.users.size || 0,
      }));
      setDailyStats(built);

      setLoading(false);
    }
    init();
  }, []);

  const totalViews = dailyStats.reduce((a, d) => a + d.views, 0);
  const totalUniqueUsers = dailyStats.reduce((a, d) => a + d.users, 0);
  const maxViews = Math.max(...dailyStats.map(d => d.views), 1);

  const avgQuizPassRate = topStories.length > 0
    ? Math.round(topStories.reduce((a, s) => a + (s.quiz_pass_rate || 0), 0) / topStories.length * 100)
    : 0;

  const sortedQuizFailures = [...quizFailures].sort((a, b) => {
    if (quizSort === 'failRate') return b.failRate - a.failRate;
    if (quizSort === 'attempts') return b.attempts - a.attempts;
    if (quizSort === 'flagged') return (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0);
    return 0;
  });

  const flagQuestion = async (questionId) => {
    // Quiz questions are stored as jsonb in quizzes table — flagging individual questions not yet supported
    setQuizFailures(prev => prev.map(q => q.id === questionId ? { ...q, flagged: true } : q));
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 900, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Analytics</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Page views, engagement, quiz analytics, and resource usage</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['7d', '30d', '90d'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '5px 12px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: period === p ? 700 : 500,
              background: period === p ? C.white : C.card, color: period === p ? C.bg : C.dim, cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Users', value: totalUsers.toLocaleString() },
          { label: 'Total Articles', value: totalStories.toLocaleString() },
          { label: 'Total Comments', value: totalComments.toLocaleString() },
          { label: 'Avg Quiz Pass', value: `${avgQuizPassRate}%`, color: avgQuizPassRate > 75 ? C.success : C.warn },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ k: 'overview', l: 'Traffic' }, { k: 'stories', l: 'Top Articles' }, { k: 'quizzes', l: 'Quiz Failures' }, { k: 'resources', l: 'Resources' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 16 }}>Daily Reads (Last 7 Days)</div>
          {totalViews === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: 20 }}>No reading data for this period</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
              {dailyStats.map(d => (
                <div key={d.day} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: `${(d.views / maxViews) * 120}px`, background: `linear-gradient(to top, ${C.accent}, ${C.accent}66)`, borderRadius: '4px 4px 0 0', marginBottom: 6 }} />
                  <div style={{ fontSize: 10, color: C.dim }}>{d.day}</div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>{d.views >= 1000 ? `${(d.views / 1000).toFixed(1)}K` : d.views}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 11, color: C.dim }}>
            {totalViews.toLocaleString()} total reads | {totalUniqueUsers.toLocaleString()} unique readers | {totalReadingHistory.toLocaleString()} all-time reads
          </div>
        </div>
      )}

      {tab === 'stories' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {topStories.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No articles yet</div>
          ) : topStories.map((story, i) => (
            <div key={story.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < topStories.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.dim, width: 20 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{story.title}</div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.dim }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: C.white }}>{(story.view_count || 0) >= 1000 ? `${((story.view_count || 0) / 1000).toFixed(1)}K` : story.view_count || 0}</div>
                  <div style={{ fontSize: 9 }}>views</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: (story.quiz_pass_rate || 0) > 0.8 ? C.success : C.white }}>{Math.round((story.quiz_pass_rate || 0) * 100)}%</div>
                  <div style={{ fontSize: 9 }}>quiz pass</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: C.white }}>{story.comment_count || 0}</div>
                  <div style={{ fontSize: 9 }}>comments</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: C.white }}>{story.avg_read_time || '—'}</div>
                  <div style={{ fontSize: 9 }}>avg time</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quiz Failure Analytics */}
      {tab === 'quizzes' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.warn}22`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 11, color: C.dim }}>
            Quiz questions that fail most often. High fail rates may indicate unclear wording, ambiguous options, or content errors. Flagged questions need editorial review.
          </div>

          {/* Editable thresholds */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: C.danger }}>Red threshold:</span>
              <input type="number" value={failRedThreshold} onChange={e => setFailRedThreshold(parseInt(e.target.value) || 0)} style={numStyle} />
              <span style={{ fontSize: 9, color: C.muted }}>%+</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: C.warn }}>Yellow threshold:</span>
              <input type="number" value={failYellowThreshold} onChange={e => setFailYellowThreshold(parseInt(e.target.value) || 0)} style={numStyle} />
              <span style={{ fontSize: 9, color: C.muted }}>%+</span>
            </div>
          </div>

          {/* Sort controls */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ k: 'failRate', l: 'Fail Rate' }, { k: 'attempts', l: 'Most Attempts' }, { k: 'flagged', l: 'Flagged First' }].map(s => (
              <button key={s.k} onClick={() => setQuizSort(s.k)} style={{
                padding: '5px 12px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: quizSort === s.k ? 700 : 500,
                background: quizSort === s.k ? C.white : C.card, color: quizSort === s.k ? C.bg : C.dim, cursor: 'pointer',
              }}>{s.l}</button>
            ))}
          </div>

          {sortedQuizFailures.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No quiz failure data yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedQuizFailures.map((q, i) => (
                <div key={q.id || i} style={{ background: C.card, border: `1px solid ${q.flagged ? C.warn + '33' : C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: C.dim }}>{q.story}</span>
                    {q.flagged && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: C.warn + '22', color: C.warn }}>FLAGGED</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted }}>{q.attempts} attempts</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: C.white }}>{q.question}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 6, borderRadius: 3, background: C.bg }}>
                        <div style={{ height: 6, borderRadius: 3, background: q.failRate > failRedThreshold ? C.danger : q.failRate > failYellowThreshold ? C.warn : C.success, width: `${q.failRate}%` }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: q.failRate > failRedThreshold ? C.danger : q.failRate > failYellowThreshold ? C.warn : C.success }}>{q.failRate}%</span>
                    <span style={{ fontSize: 9, color: C.dim }}>fail rate</span>
                  </div>
                  {q.pattern && (
                    <div style={{ fontSize: 11, color: C.soft, padding: '6px 10px', background: C.bg, borderRadius: 6, marginBottom: 6 }}>
                      Pattern: {q.pattern}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!q.flagged && <button onClick={() => flagQuestion(q.id)} style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.warn}33`, background: 'none', color: C.warn, fontWeight: 600, cursor: 'pointer' }}>Flag for Review</button>}
                    <button style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontWeight: 600, cursor: 'pointer' }}>Edit Question</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'resources' && (
        <>
          {/* Resource thresholds */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: C.warn }}>Warning at:</span>
              <input type="number" value={resourceWarnPct} onChange={e => setResourceWarnPct(parseInt(e.target.value) || 0)} style={numStyle} />
              <span style={{ fontSize: 9, color: C.muted }}>%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: C.danger }}>Danger at:</span>
              <input type="number" value={resourceDangerPct} onChange={e => setResourceDangerPct(parseInt(e.target.value) || 0)} style={numStyle} />
              <span style={{ fontSize: 9, color: C.muted }}>%</span>
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {RESOURCE_USAGE.map((r, i) => (
              <div key={r.resource} style={{ padding: '12px 16px', borderBottom: i < RESOURCE_USAGE.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{r.resource}</span>
                  <span style={{ fontSize: 11, color: C.dim }}>{r.used} / {r.limit}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.bg }}>
                  <div style={{ height: 6, borderRadius: 3, background: r.pct > resourceDangerPct ? C.danger : r.pct > resourceWarnPct ? C.warn : C.success, width: `${r.pct}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, color: C.dim }}>
            Free tier limits shown. Upgrade to Supabase Pro ($25/mo) when database or bandwidth approaches 80%. Vercel Pro ($20/mo) when invocations exceed 80K/month.
          </div>
        </>
      )}
    </div>
  );
}
