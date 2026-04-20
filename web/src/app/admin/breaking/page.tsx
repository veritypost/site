// @admin-verified 2026-04-18
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type ArticleRow = Tables<'articles'> & { categories?: { name: string } | null };

type Target = 'all' | 'paid' | 'free';

function BreakingInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [history, setHistory] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [story, setStory] = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [charLimit, setCharLimit] = useState(280);
  const [throttleMin, setThrottleMin] = useState(30);
  const [maxDaily, setMaxDaily] = useState(10);
  const [reach, setReach] = useState<{ paid: number; free: number } | null>(null);
  const [reachLoading, setReachLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles!fk_user_roles_role_id(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map((r: any) => r.roles?.name?.toLowerCase()).filter(Boolean);
      if (!profile || !roleNames.some((r: string) => r === 'owner' || r === 'admin')) { router.push('/'); return; }

      const { data, error: histError } = await supabase
        .from('articles')
        .select('*, categories!fk_articles_category_id(name)')
        .eq('is_breaking', true)
        .order('published_at', { ascending: false });
      if (histError) { setLoadError(histError.message); setHistory([]); }
      else if (data) setHistory(data as unknown as ArticleRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const charCount = text.length;
  const isValid = text.trim().length > 0 && charCount <= charLimit;

  const previewReach = async () => {
    if (!isValid) return;
    setReachLoading(true); setReach(null);
    try {
      const [paidRes, freeRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).not('plan_id', 'is', null).eq('plan_status', 'active'),
        supabase.from('users').select('id', { count: 'exact', head: true }).is('plan_id', null),
      ]);
      setReach({ paid: paidRes.count || 0, free: freeRes.count || 0 });
    } catch { /* noop */ } finally { setReachLoading(false); }
    setShowConfirm(true);
  };

  const sendAlert = async () => {
    if (!isValid) return;
    setSending(true);
    try {
      // T-012 — single-call server route owns article creation + audit +
      // push fan-out. Client no longer touches articles / record_admin_action
      // directly.
      const res = await fetch('/api/admin/broadcasts/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          story: story.trim() || undefined,
          target,
        }),
      });
      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = typeof payload.error === 'string' ? payload.error : 'Send failed';
        push({ message: msg, variant: 'danger' });
        return;
      }

      const article = (payload as { article?: ArticleRow }).article;
      if (article) {
        setHistory((prev) => [article, ...prev]);
      }
      setText(''); setStory(''); setTarget('all'); setShowConfirm(false);
      const pushError = (payload as { push_error?: boolean }).push_error;
      push({
        message: pushError
          ? 'Alert saved, but push fan-out failed — retry via the history row.'
          : 'Breaking alert sent',
        variant: pushError ? 'warn' : 'success',
      });
    } finally { setSending(false); }
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  const charColor =
    charCount > charLimit ? C.danger :
    charCount > charLimit - 30 ? C.warn : C.muted;

  return (
    <Page maxWidth={820}>
      <PageHeader
        title="Breaking News"
        subtitle="Send breaking alerts to readers. Once sent, alerts cannot be recalled."
      />

      {loadError && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>
          Failed to load alert history: {loadError}
        </div>
      )}

      <PageSection title="Alert limits" boxed>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[4], alignItems: 'flex-end' }}>
          <LabeledNum label="Char limit" value={charLimit} onChange={setCharLimit} />
          <LabeledNum label="Throttle (min between)" value={throttleMin} onChange={setThrottleMin} suffix="min" />
          <LabeledNum label="Max daily alerts" value={maxDaily} onChange={setMaxDaily} suffix="per day" />
        </div>
      </PageSection>

      <PageSection title="Compose" boxed>
        <div style={{ display: 'grid', gap: S[3] }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: S[1] }}>
              <label style={labelStyle}>Alert text</label>
              <span style={{ fontSize: F.xs, color: charColor, fontWeight: 600 }}>{charCount}/{charLimit}</span>
            </div>
            <Textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's breaking?"
              error={charCount > charLimit}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: S[3] }}>
            <div>
              <label style={labelStyle}>Link to article (optional)</label>
              <TextInput value={story} onChange={(e) => setStory(e.target.value)} placeholder="Article title or slug" />
            </div>
            <div>
              <label style={labelStyle}>Target audience</label>
              <div style={{ display: 'flex', gap: S[1] }}>
                {([
                  { k: 'all', l: 'All users' },
                  { k: 'paid', l: 'Paid users' },
                  { k: 'free', l: 'Free only' },
                ] as const).map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTarget(t.k as Target)}
                    style={{
                      flex: 1, padding: `${S[2]}px ${S[2]}px`, borderRadius: 6,
                      border: `1px solid ${target === t.k ? C.accent : C.divider}`,
                      background: target === t.k ? C.hover : C.bg,
                      color: target === t.k ? C.white : C.soft,
                      fontSize: F.sm, fontWeight: target === t.k ? 600 : 500,
                      cursor: 'pointer', font: 'inherit',
                    }}
                  >{t.l}</button>
                ))}
              </div>
            </div>
          </div>

          <Button variant="danger" block disabled={!isValid || reachLoading} loading={reachLoading} onClick={previewReach}>
            Send breaking alert
          </Button>
        </div>
      </PageSection>

      <PageSection title="Alert history">
        {history.length === 0 ? (
          <EmptyState title="No breaking alerts" description="Alerts you send appear here." size="sm" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {history.map((a) => (
              <div key={a.id} style={{
                padding: S[3], borderRadius: 8,
                border: `1px solid ${C.divider}`, background: C.bg,
              }}>
                <div style={{ fontSize: F.base, fontWeight: 600, color: C.white, marginBottom: S[1], lineHeight: 1.4 }}>{a.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], fontSize: F.xs, color: C.dim, alignItems: 'center' }}>
                  {a.categories?.name && <Badge variant="neutral" size="xs">{a.categories.name}</Badge>}
                  {(a.metadata as any)?.target && <Badge variant="info" size="xs">{(a.metadata as any).target}</Badge>}
                  <span style={{ marginLeft: 'auto' }}>
                    {(a.published_at || a.created_at) ? new Date(a.published_at || a.created_at || '').toLocaleString() : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <ConfirmDialog
        open={showConfirm}
        title="Send breaking alert?"
        message={
          <div>
            <p style={{ margin: 0, marginBottom: S[2] }}>
              This fan-outs to <strong>{target === 'all' ? 'all users' : target + ' users'}</strong> and cannot be recalled.
            </p>
            {reach ? (
              <p style={{ margin: 0, fontSize: F.sm, color: C.dim }}>
                Estimated reach: <strong>{reach.paid.toLocaleString()}</strong> paid + up to <strong>{reach.free.toLocaleString()}</strong> free
                (free-tier daily cap enforced server-side).
              </p>
            ) : null}
          </div>
        }
        confirmLabel={sending ? 'Sending…' : 'Confirm & send'}
        cancelLabel="Cancel"
        variant="danger"
        busy={sending}
        onConfirm={sendAlert}
        onCancel={() => setShowConfirm(false)}
      />
    </Page>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
  color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
};

function LabeledNum({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: S[1] }}>
        <NumberInput
          value={value}
          block={false}
          style={{ width: 90 }}
          onChange={(e: any) => onChange(parseInt(e.target.value) || 0)}
        />
        {suffix && <span style={{ fontSize: F.sm, color: C.muted }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function BreakingAdmin() {
  return (
    <ToastProvider>
      <BreakingInner />
    </ToastProvider>
  );
}
