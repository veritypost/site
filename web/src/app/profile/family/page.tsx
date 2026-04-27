// @migrated-to-permissions 2026-04-18
// @feature-verified family_admin 2026-04-18
'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { formatDate } from '@/lib/dates';

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `success` keeps inline hex (this surface uses deeper #16a34a, not `--success`).
const C = {
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: '#16a34a',
} as const;

type LeaderboardMember = {
  id: string;
  kind: 'adult' | 'kid';
  display: string;
  score: number;
  streak: number;
};

type WeeklyReport = {
  week_ending?: string;
  members?: Array<{
    id: string;
    kind: 'adult' | 'kid';
    display: string;
    articles_read: number;
    quizzes_completed: number;
  }>;
};

type SharedAchievement = {
  id: string;
  name: string;
  description: string | null;
  earned_at?: string | null;
};

export default function FamilyDashboard() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [members, setMembers] = useState<LeaderboardMember[]>([]);
  const [achievements, setAchievements] = useState<SharedAchievement[]>([]);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string>('');
  const [loadError, setLoadError] = useState<boolean>(false);
  const [denied, setDenied] = useState<boolean>(false);
  const [canViewLeaderboard, setCanViewLeaderboard] = useState<boolean>(false);
  const [canViewAchievements, setCanViewAchievements] = useState<boolean>(false);
  const [canViewReport, setCanViewReport] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadError(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setDenied(true);
      setLoading(false);
      return;
    }

    await refreshAllPermissions();
    await refreshIfStale();

    const leaderboardOk = hasPermission('family.view_leaderboard');
    const achievementsOk =
      hasPermission('family.shared_achievements') || hasPermission('kids.achievements.view');
    const reportOk = hasPermission('kids.parent.weekly_report.view');
    setCanViewLeaderboard(leaderboardOk);
    setCanViewAchievements(achievementsOk);
    setCanViewReport(reportOk);

    if (!leaderboardOk && !achievementsOk && !reportOk) {
      setDenied(true);
      setLoading(false);
      return;
    }

    // Sentinel distinguishes a fetch failure from a successful response
    // that legitimately contains an empty leaderboard / no achievements /
    // no weekly activity. Without it, a network error renders the same
    // "no activity logged" copy as a real empty household.
    const FAILED = Symbol('fetch-failed');
    const [lb, ach, rep] = await Promise.all([
      leaderboardOk
        ? fetch('/api/family/leaderboard', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .catch((err) => {
              console.error('[profile/family] leaderboard', err);
              return FAILED;
            })
        : Promise.resolve({}),
      achievementsOk
        ? fetch('/api/family/achievements', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .catch((err) => {
              console.error('[profile/family] achievements', err);
              return FAILED;
            })
        : Promise.resolve({}),
      reportOk
        ? fetch('/api/family/weekly-report', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .catch((err) => {
              console.error('[profile/family] weekly-report', err);
              return FAILED;
            })
        : Promise.resolve({}),
    ]);

    if (lb === FAILED || ach === FAILED || rep === FAILED) {
      setLoadError(true);
      setMembers([]);
      setAchievements([]);
      setReport(null);
      setLoading(false);
      return;
    }

    if (lb && (lb as { error?: string }).error) setError((lb as { error?: string }).error || '');
    setMembers((lb && (lb as { members?: LeaderboardMember[] }).members) || []);
    setAchievements((ach && (ach as { achievements?: SharedAchievement[] }).achievements) || []);
    setReport((rep as WeeklyReport) || null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading{'\u2026'}</div>;
  if (denied) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Family dashboard</h1>
        <p style={{ fontSize: 14, color: C.dim, marginBottom: 18 }}>
          The family dashboard is part of the Verity Family plan.
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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/profile/kids" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>
        &larr; Kids
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Family dashboard</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>
        Private to your household (D24). Nobody outside the family sees any of this.
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {loadError && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #dc2626',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: '#dc2626' }}>
            Couldn&rsquo;t load your family dashboard. Check your connection and retry.
          </div>
          <button
            onClick={() => load()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loadError && canViewLeaderboard && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px' }}>Most Informed</h2>
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 4,
              marginBottom: 20,
            }}
          >
            {members.length === 0 ? (
              <div style={{ padding: 20, color: C.dim, fontSize: 13 }}>
                Add family members to see the board.
              </div>
            ) : (
              members.map((m, i) => (
                <div
                  key={`${m.kind}-${m.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <span style={{ width: 24, textAlign: 'center', fontWeight: 800 }}>{i + 1}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: m.kind === 'kid' ? '#ddd6fe' : '#e0f2fe',
                      color: m.kind === 'kid' ? '#5b21b6' : '#075985',
                      fontWeight: 700,
                    }}
                  >
                    {m.kind === 'kid' ? 'KID' : 'ADULT'}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.display}</span>
                  <span style={{ fontSize: 12, color: C.dim }}>Streak {m.streak}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{m.score}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {!loadError && canViewReport && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px' }}>
            This week ({formatDate(report?.week_ending)})
          </h2>
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 12,
              marginBottom: 20,
            }}
          >
            {!report?.members?.length ? (
              <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>
                No activity logged this week.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 8,
                }}
              >
                {report.members.map((m) => (
                  <div
                    key={`${m.kind}-${m.id}`}
                    style={{
                      background: '#fff',
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{m.display}</div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                      {m.articles_read} reads &middot; {m.quizzes_completed} quizzes
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!loadError && canViewAchievements && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px' }}>
            Shared achievements
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {achievements.length === 0 ? (
              <div style={{ color: C.dim, fontSize: 13 }}>
                No shared achievements configured yet.
              </div>
            ) : (
              achievements.map((a) => {
                const earned = !!a.earned_at;
                return (
                  <div
                    key={a.id}
                    style={{
                      background: earned ? '#ecfdf5' : C.card,
                      border: `1px solid ${earned ? C.success : C.border}`,
                      borderRadius: 10,
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div>
                    <div style={{ flex: 1, fontSize: 12, color: C.dim }}>{a.description}</div>
                    {earned ? (
                      <span style={{ fontSize: 11, color: C.success, fontWeight: 700 }}>
                        Earned {formatDate(a.earned_at)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.dim }}>In progress</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
