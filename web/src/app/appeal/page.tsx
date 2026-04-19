// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

// Blueprint §10 — users can appeal any warning / mute / ban.
// The warning row carries the appeal fields; moderators resolve via
// /api/admin/appeals/[id]/resolve.
//
// Eligibility for seeing this page is a penalty-state check (is_banned /
// muted_until), not a role/plan gate — so there's no hasPermission() call
// here. The marker is still added because the sweep grep tracks every
// public page; the migration outcome here is "confirmed no gate needed".

const ACTION_LABEL: Record<string, string> = {
  warn: 'Warning',
  comment_mute_24h: '24-hour comment mute',
  mute_7d: '7-day mute',
  ban: 'Ban',
};

type WarningRow = Tables<'user_warnings'>;

type PenaltyProfile = Pick<Tables<'users'>, 'is_banned' | 'is_muted' | 'muted_until'>;

export default function AppealPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [hasPenalty, setHasPenalty] = useState<boolean>(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    // Pass 17 / UJ-513 + Task 140d: gate the page on active penalty state.
    // Banned + still-active-mute users see the appeal list. Everyone else
    // sees the empty state — the AccountStateBanner handles "no penalty"
    // messaging globally; this page is the penalty-specific surface.
    const { data: profile } = await supabase
      .from('users').select('is_banned, is_muted, muted_until').eq('id', user.id).maybeSingle<PenaltyProfile>();
    const muteActive = !!profile?.is_muted && (!profile.muted_until || new Date(profile.muted_until) > new Date());
    setHasPenalty(!!(profile?.is_banned || muteActive));

    const { data } = await supabase
      .from('user_warnings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setWarnings((data as WarningRow[] | null) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submitAppeal(id: string) {
    const text = (drafts[id] || '').trim();
    if (!text) { setError('Tell us why this was wrong.'); return; }
    setError(''); setFlash('');
    const res = await fetch('/api/appeals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_id: id, text }),
    });
    const data = await res.json().catch(() => ({} as { error?: string }));
    if (!res.ok) { setError(data?.error || 'Appeal failed'); return; }
    setFlash('Appeal submitted. A moderator will review it.');
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    load();
  }

  if (loading) return <div style={{ padding: 40, color: '#666' }}>Loading…</div>;

  if (!hasPenalty) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>No active penalties</h1>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>
          You do not have any active penalties on your account. There is nothing to appeal.
        </p>
        <a href="/" style={{ display: 'inline-block', padding: '10px 20px', background: '#111', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Back to home</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Appeal a penalty</h1>
      <p style={{ fontSize: 13, color: '#666', marginTop: 0, lineHeight: 1.5 }}>
        If a moderator took action on your account and you think it was a mistake, you can file one appeal per penalty. Approved appeals reverse the penalty.
      </p>

      {flash && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginBottom: 10 }}>{flash}</div>}
      {error && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 10 }}>{error}</div>}

      {warnings.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#666', fontSize: 13 }}>
          No penalties on your account. Nothing to appeal.
        </div>
      ) : warnings.map(w => {
        const status = w.appeal_status;
        const statusColor = status === 'approved' ? '#16a34a' : status === 'denied' ? '#dc2626' : '#b45309';
        return (
          <div key={w.id} style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{ACTION_LABEL[w.action_taken] || w.action_taken}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{new Date(w.created_at).toLocaleString()}</div>
              </div>
              {status && (
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, padding: '3px 10px', borderRadius: 999, background: `${statusColor}18` }}>
                  Appeal: {status}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#333', marginBottom: 10 }}>{w.reason}</div>

            {!status ? (
              <>
                <textarea
                  value={drafts[w.id] || ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [w.id]: e.target.value }))}
                  rows={3}
                  placeholder="Explain why this penalty should be reversed…"
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={() => submitAppeal(w.id)} style={{
                  marginTop: 6, padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>File appeal</button>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#666' }}>
                Your note: <i>{w.appeal_text}</i>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
