// @migrated-to-permissions 2026-04-18
// @feature-verified recap 2026-04-18
'use client';
import { useEffect, useState, CSSProperties } from 'react';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

// D36 / Pass 17 — weekly recap list. Permission swap:
//   • The server route (api/recap) also gates on recap.list.view and
//     returns { paid:false } for non-entitled viewers; we mirror that
//     read here so the upsell renders synchronously instead of waiting
//     on the network.
//   • The inline paywall copy is unchanged — same "Upgrade" destination.

type RecapRow = Tables<'weekly_recap_quizzes'> & {
  categories?: { name: string | null } | null;
  my_attempt?: {
    score: number;
    total_questions: number;
    completed_at: string | null;
  } | null;
};

interface RecapListResponse {
  recaps?: RecapRow[];
  paid?: boolean;
}

const C = {
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111',
  dim: '#666',
  accent: '#111',
  success: '#16a34a',
} as const;

// LAUNCH: weekly recap hidden pre-launch. Flip to false when sign-ups
// and paid plans open. Component + queries + types stay alive — see
// companion revert guide in Sessions/04-21-2026.
const LAUNCH_HIDE_RECAP = true;

export default function RecapListPage() {
  if (LAUNCH_HIDE_RECAP) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [loading, setLoading] = useState<boolean>(true);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [recaps, setRecaps] = useState<RecapRow[]>([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [canView, setCanView] = useState<boolean>(true);

  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  useEffect(() => {
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      const allowed = hasPermission('recap.list.view');
      setCanView(allowed);
      if (!allowed) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/recap');
        const data = (await res.json()) as RecapListResponse;
        // Server enforces the same key; if it says paid:false, trust it
        // (covers account-state downgrades the client cache hasn't seen).
        if (data.paid === false) setCanView(false);
        setRecaps(data.recaps || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;

  if (!canView) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 20, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Weekly recap quiz</h1>
        <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, marginBottom: 20 }}>
          Test what you kept up with this week. See which articles you missed.
        </p>
        <a href="/profile/settings/billing" style={upgradeBtn}>
          Upgrade
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>This week&apos;s recap</h1>
      <p style={{ fontSize: 13, color: C.dim, marginTop: 0, marginBottom: 20 }}>
        A quick test on the past 7 days of coverage. Anything you miss, we surface so you can catch
        up.
      </p>

      {recaps.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontSize: 13 }}>
          No recaps ready yet. Check back later.
        </div>
      ) : (
        recaps.map((r) => {
          const done = !!r.my_attempt;
          return (
            <a
              key={r.id}
              href={`/recap/${r.id}`}
              style={{
                display: 'block',
                background: C.card,
                border: `1px solid ${done ? C.success : C.border}`,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                textDecoration: 'none',
                color: C.text,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                {r.categories?.name || 'All categories'} · Week of{' '}
                {new Date(r.week_start).toLocaleDateString()}
                {done &&
                  r.my_attempt &&
                  ` · Completed ${r.my_attempt.score}/${r.my_attempt.total_questions}`}
              </div>
            </a>
          );
        })
      )}
    </div>
  );
}

const upgradeBtn: CSSProperties = {
  display: 'inline-block',
  padding: '12px 24px',
  background: '#111',
  color: '#fff',
  borderRadius: 10,
  fontWeight: 700,
  textDecoration: 'none',
};
