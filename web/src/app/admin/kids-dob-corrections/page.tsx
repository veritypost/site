/**
 * Phase 4 of AI + Plan Change Implementation — admin DOB correction queue UI.
 *
 * Lists pending + decided DOB-correction requests with status filters.
 * Click-through to /admin/kids-dob-corrections/[id] for full detail +
 * decision panel.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Page, { PageHeader } from '@/components/admin/Page';

type CorrectionRow = {
  id: string;
  kid_profile_id: string;
  parent_user_id: string;
  current_dob: string;
  requested_dob: string;
  current_band: 'kids' | 'tweens' | 'graduated';
  resulting_band: 'kids' | 'tweens' | 'graduated';
  direction: 'younger' | 'older' | 'same';
  reason: string;
  documentation_url: string | null;
  status: string;
  decision_reason: string | null;
  decided_at: string | null;
  cooldown_ends_at: string | null;
  created_at: string;
};

const ADMIN_C = {
  bg: '#fafafa',
  card: '#fff',
  border: '#e5e5e5',
  text: '#0a0a0a',
  dim: '#666',
  accent: '#0070f3',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#b45309',
  approved: '#16a34a',
  rejected: '#dc2626',
  documentation_requested: '#7c3aed',
  rejected_no_response: '#9ca3af',
};

const DIRECTION_COLOR: Record<string, string> = {
  younger: '#16a34a',
  older: '#dc2626',
  same: '#9ca3af',
};

export default function KidsDobCorrectionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [directionFilter, setDirectionFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (directionFilter !== 'all') params.set('direction', directionFilter);
      try {
        const res = await fetch(`/api/admin/kids-dob-corrections?${params.toString()}`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `HTTP ${res.status}`);
          setRows([]);
        } else {
          const j = await res.json();
          setRows(j.rows ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, directionFilter, router]);

  return (
    <Page>
      <PageHeader
        title="Kid DOB Corrections"
        subtitle="Review parent-submitted DOB correction requests. Younger-band requests auto-approve after 7 days unless fraud signals fire. Older-band requests require birth-certificate documentation and manual review."
      />

      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: ADMIN_C.dim, marginBottom: 4 }}>Status</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'pending', 'documentation_requested', 'approved', 'rejected'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${ADMIN_C.border}`,
                  background: statusFilter === s ? ADMIN_C.accent : ADMIN_C.card,
                  color: statusFilter === s ? '#fff' : ADMIN_C.text,
                  cursor: 'pointer',
                }}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: ADMIN_C.dim, marginBottom: 4 }}>Direction</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'younger', 'older'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirectionFilter(d)}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${ADMIN_C.border}`,
                  background: directionFilter === d ? ADMIN_C.accent : ADMIN_C.card,
                  color: directionFilter === d ? '#fff' : ADMIN_C.text,
                  cursor: 'pointer',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div style={{ color: ADMIN_C.dim }}>Loading…</div>}
      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 6 }}>
          {error}
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: ADMIN_C.dim,
            background: ADMIN_C.card,
            border: `1px solid ${ADMIN_C.border}`,
            borderRadius: 8,
          }}
        >
          No correction requests in this filter.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/kids-dob-corrections/${r.id}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: 12,
              padding: 12,
              alignItems: 'center',
              background: ADMIN_C.card,
              border: `1px solid ${ADMIN_C.border}`,
              borderRadius: 8,
              textDecoration: 'none',
              color: ADMIN_C.text,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: ADMIN_C.dim,
                  marginBottom: 2,
                  fontFamily: 'monospace',
                }}
              >
                {r.id.slice(0, 8)} · kid {r.kid_profile_id.slice(0, 8)}
              </div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                {r.current_dob} → <strong>{r.requested_dob}</strong>{' '}
                <span style={{ color: ADMIN_C.dim }}>
                  ({r.current_band} → {r.resulting_band})
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: ADMIN_C.dim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.reason}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: DIRECTION_COLOR[r.direction] || ADMIN_C.dim,
              }}
            >
              {r.direction}
            </span>
            {r.documentation_url && (
              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>📎 docs</span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: STATUS_COLOR[r.status] || ADMIN_C.dim,
                }}
              >
                {r.status.replace('_', ' ')}
              </span>
              <span style={{ fontSize: 11, color: ADMIN_C.dim }}>
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
