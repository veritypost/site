/**
 * Phase 4 of AI + Plan Change Implementation — DOB correction detail.
 *
 * Three-column layout: kid context | the request | parent context.
 * Decision panel at the bottom: approve / reject / request docs with
 * required reason. Calls /api/admin/kids-dob-corrections/[id] POST.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Page, { PageHeader } from '@/components/admin/Page';

type Detail = {
  request: {
    id: string;
    kid_profile_id: string;
    parent_user_id: string;
    current_dob: string;
    requested_dob: string;
    current_band: string;
    resulting_band: string;
    direction: 'younger' | 'older' | 'same';
    reason: string;
    documentation_url: string | null;
    status: string;
    decision_reason: string | null;
    decided_at: string | null;
    cooldown_ends_at: string | null;
    created_at: string;
    ip_address: string | null;
  };
  kid: {
    id: string;
    display_name: string | null;
    avatar_color: string | null;
    date_of_birth: string | null;
    reading_band: string | null;
    band_history: unknown;
    created_at: string;
    articles_read_count: number | null;
    quizzes_completed_count: number | null;
    streak_current: number | null;
    last_active_at: string | null;
    is_active: boolean | null;
  } | null;
  parent: {
    id: string;
    email: string | null;
    plan_status: string | null;
    created_at: string | null;
    plans: { name: string | null; tier: string | null } | null;
  } | null;
  siblings: Array<{
    id: string;
    display_name: string | null;
    date_of_birth: string | null;
    reading_band: string | null;
    is_active: boolean | null;
    created_at: string | null;
  }>;
  parent_correction_count: number;
  dob_history: Array<{
    id: string;
    old_dob: string | null;
    new_dob: string;
    change_source: string;
    decision_reason: string | null;
    created_at: string;
  }>;
  fraud_signals: string[];
};

const ADMIN_C = {
  bg: '#fafafa',
  card: '#fff',
  border: '#e5e5e5',
  text: '#0a0a0a',
  dim: '#666',
  accent: '#0070f3',
  warn: '#b45309',
  danger: '#dc2626',
  success: '#16a34a',
};

export default function DobCorrectionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [decision, setDecision] = useState<'approved' | 'rejected' | 'documentation_requested'>(
    'approved'
  );
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/kids-dob-corrections/${id}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `HTTP ${res.status}`);
        } else {
          const j = (await res.json()) as Detail;
          setDetail(j);
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
  }, [id, router]);

  const submit = async () => {
    if (reason.trim().length < 5) {
      setSubmitMsg('Reason is required (min 5 chars).');
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch(`/api/admin/kids-dob-corrections/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitMsg(j.error || 'Decision failed');
      } else {
        setSubmitMsg(`Decision recorded: ${j.decision}.`);
        // Refresh detail
        const fresh = await fetch(`/api/admin/kids-dob-corrections/${id}`, { cache: 'no-store' });
        if (fresh.ok) setDetail((await fresh.json()) as Detail);
      }
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : 'submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <PageHeader title="DOB Correction" subtitle="Loading…" />
      </Page>
    );
  }
  if (error || !detail) {
    return (
      <Page>
        <PageHeader title="DOB Correction" subtitle="Could not load" />
        <div style={{ color: ADMIN_C.danger }}>{error || 'Not found'}</div>
        <Link href="/admin/kids-dob-corrections" style={{ color: ADMIN_C.accent }}>
          ← Back to queue
        </Link>
      </Page>
    );
  }

  const r = detail.request;
  const isPending = r.status === 'pending' || r.status === 'documentation_requested';

  return (
    <Page>
      <PageHeader
        title={`DOB Correction · ${r.id.slice(0, 8)}`}
        subtitle={`Submitted ${new Date(r.created_at).toLocaleString()} · status: ${r.status}`}
      />

      <Link href="/admin/kids-dob-corrections" style={{ color: ADMIN_C.accent, fontSize: 13 }}>
        ← Back to queue
      </Link>

      {detail.fraud_signals.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: '#fef3c7',
            border: `1px solid ${ADMIN_C.warn}`,
            borderRadius: 6,
          }}
        >
          <strong>Fraud signals:</strong>{' '}
          {detail.fraud_signals.map((s) => (
            <span
              key={s}
              style={{
                display: 'inline-block',
                marginRight: 6,
                padding: '2px 6px',
                background: '#fff',
                border: `1px solid ${ADMIN_C.warn}`,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* Kid */}
        <div style={{ background: ADMIN_C.card, border: `1px solid ${ADMIN_C.border}`, borderRadius: 8, padding: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Kid</h3>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div><strong>{detail.kid?.display_name || '(no name)'}</strong></div>
            <div>DOB: {detail.kid?.date_of_birth || '—'}</div>
            <div>Band: {detail.kid?.reading_band || '—'}</div>
            <div>
              Created:{' '}
              {detail.kid?.created_at ? new Date(detail.kid.created_at).toLocaleDateString() : '—'}
            </div>
            <div>Articles read: {detail.kid?.articles_read_count ?? 0}</div>
            <div>Quizzes completed: {detail.kid?.quizzes_completed_count ?? 0}</div>
            <div>Streak: {detail.kid?.streak_current ?? 0}</div>
            <div>
              Last active:{' '}
              {detail.kid?.last_active_at
                ? new Date(detail.kid.last_active_at).toLocaleDateString()
                : 'never'}
            </div>
          </div>
          {detail.dob_history.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: ADMIN_C.dim, marginBottom: 4 }}>DOB history</div>
              {detail.dob_history.map((h) => (
                <div key={h.id} style={{ fontSize: 12, marginBottom: 4 }}>
                  {h.old_dob || '—'} → {h.new_dob} ({h.change_source})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Request */}
        <div style={{ background: ADMIN_C.card, border: `1px solid ${ADMIN_C.border}`, borderRadius: 8, padding: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Request</h3>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>
              <strong>{r.current_dob}</strong> → <strong>{r.requested_dob}</strong>
            </div>
            <div>
              Band: {r.current_band} → <strong>{r.resulting_band}</strong>
            </div>
            <div>Direction: <strong>{r.direction}</strong></div>
            <div>Status: <strong>{r.status}</strong></div>
            {r.cooldown_ends_at && (
              <div>Cooldown ends: {new Date(r.cooldown_ends_at).toLocaleString()}</div>
            )}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: ADMIN_C.dim }}>Reason:</div>
              <div>{r.reason}</div>
            </div>
            {r.documentation_url && (
              <div style={{ marginTop: 8 }}>
                <a href={r.documentation_url} target="_blank" rel="noreferrer" style={{ color: ADMIN_C.accent }}>
                  📎 View documentation
                </a>
              </div>
            )}
            {r.ip_address && (
              <div style={{ marginTop: 8, fontSize: 12, color: ADMIN_C.dim }}>
                Submitted from {r.ip_address}
              </div>
            )}
            {r.decision_reason && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: ADMIN_C.dim }}>Decision reason:</div>
                <div>{r.decision_reason}</div>
              </div>
            )}
            {r.decided_at && (
              <div style={{ fontSize: 12, color: ADMIN_C.dim }}>
                Decided {new Date(r.decided_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Parent */}
        <div style={{ background: ADMIN_C.card, border: `1px solid ${ADMIN_C.border}`, borderRadius: 8, padding: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Parent</h3>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div><strong>{detail.parent?.email || '(no email)'}</strong></div>
            <div>
              Plan: {detail.parent?.plans?.name || '—'} ({detail.parent?.plan_status || '—'})
            </div>
            <div>
              Joined:{' '}
              {detail.parent?.created_at
                ? new Date(detail.parent.created_at).toLocaleDateString()
                : '—'}
            </div>
            <div>Lifetime correction count: {detail.parent_correction_count}</div>
          </div>
          {detail.siblings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: ADMIN_C.dim, marginBottom: 4 }}>
                Other kids in household
              </div>
              {detail.siblings.map((s) => (
                <div key={s.id} style={{ fontSize: 12, marginBottom: 4 }}>
                  {s.display_name || '(no name)'} · DOB {s.date_of_birth || '—'} · band{' '}
                  {s.reading_band || '—'} {s.is_active === false && '(inactive)'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Decision panel */}
      {isPending && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: ADMIN_C.card,
            border: `2px solid ${ADMIN_C.accent}`,
            borderRadius: 8,
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Decision</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['approved', 'rejected', 'documentation_requested'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDecision(d)}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${ADMIN_C.border}`,
                  background:
                    decision === d
                      ? d === 'approved'
                        ? ADMIN_C.success
                        : d === 'rejected'
                          ? ADMIN_C.danger
                          : '#7c3aed'
                      : ADMIN_C.card,
                  color: decision === d ? '#fff' : ADMIN_C.text,
                  cursor: 'pointer',
                }}
              >
                {d.replace('_', ' ')}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Decision reason (required, shown in audit log + email to parent)"
            rows={3}
            style={{
              width: '100%',
              padding: 8,
              fontSize: 13,
              border: `1px solid ${ADMIN_C.border}`,
              borderRadius: 6,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={submit}
              disabled={submitting || reason.trim().length < 5}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: ADMIN_C.accent,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: submitting || reason.trim().length < 5 ? 'not-allowed' : 'pointer',
                opacity: submitting || reason.trim().length < 5 ? 0.5 : 1,
              }}
            >
              {submitting ? 'Submitting…' : `Submit ${decision.replace('_', ' ')}`}
            </button>
            {submitMsg && <span style={{ fontSize: 13, color: ADMIN_C.dim }}>{submitMsg}</span>}
          </div>
        </div>
      )}
    </Page>
  );
}
