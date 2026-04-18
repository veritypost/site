'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const numStyle = { width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid #222222', background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

export default function BreakingAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [story, setStory] = useState('');
  const [target, setTarget] = useState('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [sent, setSent] = useState(false);
  const [charLimit, setCharLimit] = useState(280);
  const [throttleMin, setThrottleMin] = useState(30);
  const [maxDaily, setMaxDaily] = useState(10);
  const [reach, setReach] = useState(null); // { free_remaining, paid, total }
  const [reachLoading, setReachLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Admin check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name?.toLowerCase()).filter(Boolean);
      if (!profile || !roleNames.some((r) => r === 'owner' || r === 'admin')) {
        router.push('/');
        return;
      }

      // Fetch breaking stories
      const { data } = await supabase
        .from('articles')
        .select('*, categories(name)')
        .eq('is_breaking', true)
        .order('published_at', { ascending: false });

      if (data) setHistory(data);
      setLoading(false);
    };
    init();
  }, []);

  const charCount = text.length;
  const isValid = text.trim().length > 0 && charCount <= charLimit;

  const sendAlert = async () => {
    if (!isValid) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'breaking_news.send',
      p_target_table: 'articles',
      p_target_id: null,
      p_reason: null,
      p_old_value: null,
      p_new_value: { text: text.trim(), story: story.trim() || null, target },
    });
    if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
    const newAlert = {
      text: text.trim(),
      story: story.trim() || null,
      sent_by: user?.id ?? null,
      target,
      is_breaking: true,
      published_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('articles')
      .insert(newAlert)
      .select('*, categories(name)')
      .single();
    if (!error && data) {
      setHistory(prev => [data, ...prev]);
      // D14: fan out the breaking-news notification to every eligible user.
      // send_breaking_news enforces the free-tier daily cap per user.
      try {
        await fetch('/api/admin/broadcasts/breaking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article_id: data.id,
            title: text.trim().slice(0, 300),
            body: story.trim() || null,
          }),
        });
      } catch {}
    }
    setText('');
    setStory('');
    setTarget('all');
    setShowConfirm(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  // Normalise field names
  const normAlert = (a) => ({
    ...a,
    text: a.text ?? a.headline ?? a.title ?? '',
    story: a.story ?? (a.categories?.name ?? ''),
    sentAt: (a.published_at ?? a.sent_at ?? a.created_at ?? '').replace('T', ' ').slice(0, 16),
    sentBy: a.sent_by ?? a.author ?? 'system',
    target: a.target ?? 'all',
    recipients: a.recipients ?? 0,
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  const displayHistory = history.map(normAlert);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      </div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Breaking News</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Send breaking news alerts to users. Cannot be recalled after sending.</p>
      </div>

      {/* Alert limits */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Char limit:</span>
          <input type="number" value={charLimit} onChange={e => setCharLimit(parseInt(e.target.value) || 0)} style={numStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Min between alerts:</span>
          <input type="number" value={throttleMin} onChange={e => setThrottleMin(parseInt(e.target.value) || 0)} style={numStyle} />
          <span style={{ fontSize: 10, color: C.muted }}>min</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Max daily:</span>
          <input type="number" value={maxDaily} onChange={e => setMaxDaily(parseInt(e.target.value) || 0)} style={numStyle} />
          <span style={{ fontSize: 10, color: C.muted }}>alerts/day</span>
        </div>
      </div>

      {/* Compose */}
      <div style={{ background: C.card, border: `1px solid ${C.danger}33`, borderRadius: 14, padding: 20, marginBottom: 30 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          Compose Alert
        </div>

        {/* Alert text */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: 'uppercase' }}>Alert Text</label>
            <span style={{ fontSize: 10, color: charCount > charLimit ? C.danger : charCount > 250 ? C.warn : C.muted, fontWeight: 600 }}>{charCount}/{charLimit}</span>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's breaking?" rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${charCount > charLimit ? C.danger : C.border}`, background: C.bg, color: C.white, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </div>

        {/* Story link + target */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Link to Article (optional)</label>
            <input value={story} onChange={e => setStory(e.target.value)} placeholder="Article title or slug..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 12, outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Target Audience</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: 'all', l: 'All Users' }, { k: 'paid', l: 'Paid Users' }, { k: 'free', l: 'Free Only' }].map(t => (
                <button key={t.k} onClick={() => setTarget(t.k)} style={{
                  flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${target === t.k ? C.danger + '44' : C.border}`,
                  background: target === t.k ? C.danger + '12' : 'transparent', color: target === t.k ? C.white : C.dim,
                  fontSize: 11, fontWeight: target === t.k ? 700 : 500, cursor: 'pointer',
                }}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Send */}
        {!showConfirm ? (
          <button onClick={async () => {
            if (!isValid) return;
            // Pass 17 / UJ-1305: load a rough reach estimate the admin
            // can sanity-check before firing. Paid users always receive;
            // free users are subject to the D14 daily cap enforced
            // server-side.
            setReachLoading(true); setReach(null);
            try {
              const [{ count: paidCount }, { count: freeCount }] = await Promise.all([
                supabase.from('users').select('id', { count: 'exact', head: true }).not('plan_id', 'is', null).eq('plan_status', 'active'),
                supabase.from('users').select('id', { count: 'exact', head: true }).is('plan_id', null),
              ]);
              setReach({ paid: paidCount || 0, free: freeCount || 0 });
            } catch {} finally { setReachLoading(false); }
            setShowConfirm(true);
          }} disabled={!isValid} style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800,
            background: isValid ? C.danger : C.muted, color: '#fff', cursor: isValid ? 'pointer' : 'default',
            letterSpacing: '0.02em',
          }}>
            {sent ? 'Alert Sent' : 'Send Breaking Alert'}
          </button>
        ) : (
          <div style={{ background: C.danger + '12', border: `2px solid ${C.danger}`, borderRadius: 10, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.danger, marginBottom: 8 }}>Are you sure? This cannot be recalled.</div>
            <div style={{ fontSize: 12, color: C.soft, marginBottom: 8 }}>
              Sending to: <strong>{target === 'all' ? 'all users' : target}</strong>
            </div>
            {reachLoading ? (
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Estimating reach…</div>
            ) : reach ? (
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
                Estimated reach: {reach.paid.toLocaleString()} paid users + up to {reach.free.toLocaleString()} free users (D14 cap enforces max 1 breaking alert per free user per day server-side).
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setShowConfirm(false)} style={{
                padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={sendAlert} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', background: C.danger, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>Confirm &amp; Send</button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: C.soft, margin: '0 0 12px' }}>Alert History</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayHistory.map(alert => (
          <div key={alert.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 6, lineHeight: 1.4 }}>{alert.text}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: C.dim, flexWrap: 'wrap' }}>
              <span>{alert.story}</span>
              <span>{alert.sentBy}</span>
              <span>{alert.target}</span>
              {alert.recipients > 0 && <span>{alert.recipients.toLocaleString()} recipients</span>}
              <span style={{ marginLeft: 'auto' }}>{alert.sentAt}</span>
            </div>
          </div>
        ))}
        {displayHistory.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No breaking alerts found.</div>
        )}
      </div>
    </div>
  );
}
