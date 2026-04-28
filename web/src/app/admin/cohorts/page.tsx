'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import EmptyState from '@/components/admin/EmptyState';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Cohort = Tables<'cohorts'> & { count?: number; desc?: string | null };
type Campaign = Tables<'campaigns'> & { cohort_name?: string | null; cohorts?: { name: string } | null };

// S6-A31: the Custom-builder tab and its 6-category / 30-filter constant
// were removed 2026-04-28. The page advertised a Run/Preview/Save flow that
// had no backing endpoint (`POST /api/admin/cohorts/preview` never existed).
// Owner segmentation work is a real future need; ship it as a proper
// endpoint + UI when the time comes. Until then the cohort list + past
// campaigns are the operator surface here. Do NOT reintroduce the dead
// builder.

export default function CohortsAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'cohorts' | 'campaigns'>('cohorts');
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [msgType, setMsgType] = useState<'email' | 'push' | 'in-app'>('email');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: me } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (
        (userRoles || []) as Array<{ roles: { name: string | null } | null }>
      )
        .map((r) => r.roles?.name)
        .filter((n): n is string => typeof n === 'string');
      if (!me || !roleNames.some((r) => ADMIN_ROLES.has(r))) { router.push('/'); return; }

      const { data: cohortRows } = await supabase
        .from('cohorts').select('*').order('created_at', { ascending: false });
      setCohorts((cohortRows || []) as Cohort[]);

      const { data: campaignRows } = await supabase
        .from('campaigns')
        .select('id, name, cohort_id, type, channel, subject, body, sent_count, opened_count, clicked_count, conversion_count, completed_at, cohorts ( name )')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(20);
      setCampaigns(
        ((campaignRows || []) as Campaign[]).map((c) => ({
          ...c,
          cohort_name: c.cohorts?.name || null,
        }))
      );
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async () => {
    if (!selectedCohort) return;
    const cohort = cohorts.find((c) => c.id === selectedCohort);
    if (!cohort) return;
    setSending(true);
    try {
      const { data: inserted, error } = await supabase
        .from('campaigns')
        .insert({
          name: msgSubject || `${cohort.name} · ${new Date().toISOString().slice(0, 10)}`,
          cohort_id: cohort.id,
          type: msgType === 'in-app' ? 'in-app' : msgType,
          channel: msgType === 'in-app' ? 'in-app' : msgType,
          subject: msgSubject || null,
          body: msgBody || null,
          completed_at: new Date().toISOString(),
        })
        .select('id, name, cohort_id, type, channel, subject, body, sent_count, opened_count, clicked_count, conversion_count, completed_at')
        .single();
      if (error) { push({ message: 'Send failed. Try again.', variant: 'danger' }); return; }
      if (inserted) {
        setCampaigns(
          (prev) => [{ ...(inserted as Campaign), cohort_name: cohort.name }, ...prev]
        );
        push({ message: 'Campaign sent', variant: 'success' });
      }
      setShowCompose(false); setMsgSubject(''); setMsgBody('');
    } finally { setSending(false); }
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  const selectedCohortObj = cohorts.find((c) => c.id === selectedCohort);

  return (
    <Page maxWidth={1000}>
      <PageHeader
        title="User cohorts & messaging"
        subtitle="Send targeted emails or push notifications to predefined cohorts."
      />

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {([
          { k: 'cohorts', l: 'Cohorts' },
          { k: 'campaigns', l: 'Past campaigns' },
        ] as const).map((t) => (
          <Button
            key={t.k} size="sm"
            variant={tab === t.k ? 'primary' : 'secondary'}
            onClick={() => setTab(t.k)}
          >{t.l}</Button>
        ))}
      </div>

      {tab === 'cohorts' && (
        <PageSection>
          {cohorts.length === 0 ? (
            <EmptyState
              title="No cohorts yet"
              description="Predefined cohorts appear here once seeded."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {cohorts.map((cohort) => (
                <div
                  key={cohort.id}
                  onClick={() => { setSelectedCohort(cohort.id); setShowCompose(false); }}
                  style={{
                    padding: `${S[3]}px ${S[4]}px`, borderRadius: 8,
                    background: C.bg,
                    border: `1px solid ${selectedCohort === cohort.id ? C.accent : C.divider}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: S[4],
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: F.md, fontWeight: 600 }}>{cohort.name}</div>
                    <div style={{ fontSize: F.sm, color: C.dim }}>{cohort.desc || cohort.description || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: F.xl, fontWeight: 600, color: C.accent }}>{cohort.count ?? '—'}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>users</div>
                  </div>
                  <Button size="sm" variant="primary" onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setSelectedCohort(cohort.id); setShowCompose(true); }}>
                    Message
                  </Button>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      )}

      {tab === 'campaigns' && (
        <PageSection>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns sent yet" description="Campaigns you send to cohorts appear here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {campaigns.map((c) => (
                <div key={c.id} style={{
                  padding: `${S[3]}px ${S[4]}px`, borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.divider}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S[2], flexWrap: 'wrap', gap: S[2] }}>
                    <div>
                      <div style={{ fontSize: F.md, fontWeight: 600 }}>{c.name || c.subject || 'Campaign'}</div>
                      <div style={{ fontSize: F.xs, color: C.dim }}>
                        {c.cohort_name} · {c.channel || c.type} · {c.completed_at ? new Date(c.completed_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                    gap: S[3],
                  }}>
                    <CampaignStat label="Sent" value={c.sent_count ?? '—'} />
                    <CampaignStat label="Opened" value={c.opened_count ?? '—'} />
                    <CampaignStat label="Clicked" value={c.clicked_count ?? '—'} />
                    <CampaignStat label="Converted" value={c.conversion_count ?? '—'} />
                    {c.sent_count && c.opened_count ? (
                      <CampaignStat label="Open rate" value={`${Math.round((c.opened_count || 0) / (c.sent_count || 1) * 100)}%`} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      )}

      <Drawer
        open={showCompose && !!selectedCohortObj}
        onClose={() => setShowCompose(false)}
        title={selectedCohortObj ? `Message: ${selectedCohortObj.name}` : 'Message'}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button variant="primary" loading={sending} disabled={!msgBody.trim()} onClick={sendMessage}>Send</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: S[3] }}>
          {selectedCohortObj?.count != null && (
            <div style={{ fontSize: F.sm, color: C.dim }}>
              This will send to <strong>{selectedCohortObj.count}</strong> users.
            </div>
          )}
          <div style={{ display: 'flex', gap: S[1] }}>
            {(['email', 'push', 'in-app'] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={msgType === t ? 'primary' : 'secondary'}
                onClick={() => setMsgType(t)}
              >{t.charAt(0).toUpperCase() + t.slice(1)}</Button>
            ))}
          </div>
          {msgType === 'email' && (
            <TextInput placeholder="Subject line" value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
          )}
          <Textarea rows={6} placeholder="Message body" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
        </div>
      </Drawer>
    </Page>
  );
}

function CampaignStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: F.lg, fontWeight: 700, color: C.white }}>{value}</div>
      <div style={{ fontSize: F.xs, color: C.dim }}>{label}</div>
    </div>
  );
}
