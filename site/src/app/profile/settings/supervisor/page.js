'use client';
import { useState, useEffect } from 'react';
import { createClient } from '../../../../lib/supabase/client';
import ConfirmDialog from '@/components/ConfirmDialog';

// D22 — Category Supervisor opt-in. Eligibility is per-category
// score ≥ supervisor_eligibility_score (default 500). A user can
// supervise multiple categories. Supervisors can flag (fast-lane
// to the moderator queue) and report with explanation; they have
// no direct moderation power.

export default function SupervisorSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(500);
  const [rows, setRows] = useState([]);            // { id, name, score, eligible, opted_in }
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [pendingOptOut, setPendingOptOut] = useState(null); // { id, name }
  const [optOutBusy, setOptOutBusy] = useState(false);

  async function load() {
    setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: setting }, { data: cats }, { data: scores }, { data: sups }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'supervisor_eligibility_score').maybeSingle(),
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('category_scores').select('category_id, score').eq('user_id', user.id),
      supabase.from('category_supervisors').select('category_id, is_active, opted_in_at, opted_out_at').eq('user_id', user.id),
    ]);
    const th = Number(setting?.value || 500);
    setThreshold(th);

    const scoreMap = Object.fromEntries((scores || []).map(s => [s.category_id, s.score]));
    const supMap = Object.fromEntries((sups || []).map(s => [s.category_id, s]));

    setRows((cats || []).map(c => {
      const s = supMap[c.id];
      const opted_out_at = s?.opted_out_at ? new Date(s.opted_out_at) : null;
      // Pass 17 / UJ-721: a seven-day cooldown window after stepping
      // down — the UI surfaces the window explicitly rather than falling
      // back to the generic "Not eligible" branch.
      const cooldownEndsAt = opted_out_at ? new Date(opted_out_at.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
      const inCooldown = cooldownEndsAt && cooldownEndsAt > new Date();
      return {
        id: c.id,
        name: c.name,
        score: scoreMap[c.id] || 0,
        eligible: (scoreMap[c.id] || 0) >= th,
        opted_in: !!(s?.is_active && !s?.opted_out_at),
        opted_in_at: s?.opted_in_at || null,
        cooldown_ends_at: inCooldown ? cooldownEndsAt.toISOString() : null,
      };
    }));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function optIn(id) {
    setError(''); setFlash('');
    const res = await fetch('/api/supervisor/opt-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data?.error || 'Opt-in failed'); return; }
    setFlash('Welcome — you can now flag comments in this category.');
    load();
  }
  function requestOptOut(row) {
    setPendingOptOut({ id: row.id, name: row.name });
  }

  async function confirmOptOut() {
    if (!pendingOptOut) return;
    setOptOutBusy(true);
    try {
      const res = await fetch('/api/supervisor/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: pendingOptOut.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Opt-out failed'); return; }
      setPendingOptOut(null);
      load();
    } finally {
      setOptOutBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#666' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
      <a href="/profile/settings" style={{ fontSize: 13, fontWeight: 600, color: '#666', textDecoration: 'none' }}>← Back to settings</a>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>Category Supervisor</h2>
      <p style={{ fontSize: 13, color: '#666', marginTop: 0, lineHeight: 1.5 }}>
        Eligibility threshold: <b>{threshold}</b> Verity Score in a category. Supervisors flag comments (fast-lane to moderators) and can file reports with written context. You can opt in to as many categories as you qualify for.
      </p>

      {flash && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginBottom: 10 }}>{flash}</div>}
      {error && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: r.eligible ? '#16a34a' : '#666' }}>
                Your score: {r.score} {r.eligible ? '· eligible' : `· need ${threshold - r.score} more`}
              </div>
            </div>
            {r.opted_in ? (
              <div style={{ textAlign: 'right' }}>
                {r.opted_in_at && <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Opted in {new Date(r.opted_in_at).toLocaleDateString()}</div>}
                <button onClick={() => requestOptOut(r)} style={btnGhost}>Step down</button>
              </div>
            ) : r.cooldown_ends_at ? (
              <span style={{ fontSize: 11, color: '#b45309', textAlign: 'right', maxWidth: 180 }}>
                Recently stepped down — reapply after {new Date(r.cooldown_ends_at).toLocaleDateString()}
              </span>
            ) : r.eligible ? (
              <button onClick={() => optIn(r.id)} style={btnSolid}>Opt in</button>
            ) : (
              <span style={{ fontSize: 11, color: '#999' }}>Not eligible</span>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!pendingOptOut}
        title="Step down from this category?"
        message={pendingOptOut ? `You will stop supervising "${pendingOptOut.name}". A 7-day cooldown applies before you can re-apply.` : ''}
        confirmLabel="Step down"
        busy={optOutBusy}
        onConfirm={confirmOptOut}
        onClose={() => !optOutBusy && setPendingOptOut(null)}
      />
    </div>
  );
}

const btnSolid = { padding: '7px 14px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e5e5', background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
