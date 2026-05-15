'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type AdUnit = Tables<'ad_units'>;

type QueueRow = AdUnit & {
  ad_placements: { name: string; display_name: string } | null;
};

type ActionState = { id: string; action: 'approve' | 'reject' } | null;

function QueueInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [acting, setActing] = useState<ActionState>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const ok = ((r || []) as Array<{ roles: { name: string | null } | null }>).some(
        (x) => !!x.roles?.name && ADMIN_ROLES.has(x.roles.name)
      );
      if (!ok) { router.push('/'); return; }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from('ad_units')
      .select('*, ad_placements(name, display_name)')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });
    if (error) {
      push({ message: error.message || 'Failed to load queue', variant: 'danger' });
      return;
    }
    setRows((data || []) as QueueRow[]);
  }

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActing({ id, action });
    try {
      const res = await fetch(`/api/admin/ad-units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: action === 'approve' ? 'approved' : 'rejected' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: d?.error || `${action} failed`, variant: 'danger' });
        return;
      }
      push({ message: action === 'approve' ? 'Creative approved' : 'Creative rejected', variant: 'success' });
      await load();
    } catch (err) {
      push({ message: (err as Error)?.message || `${action} failed`, variant: 'danger' });
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading…
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const cols = [
    {
      key: 'name',
      header: 'Unit',
      truncate: true,
      render: (row: QueueRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: F.base }}>{row.name}</div>
          <div style={{ fontSize: F.xs, color: C.dim }}>{row.advertiser_name || '—'}</div>
        </div>
      ),
    },
    {
      key: 'placement',
      header: 'Placement',
      render: (row: QueueRow) => (
        <span style={{ fontSize: F.sm, color: C.soft }}>
          {row.ad_placements?.display_name || row.ad_placements?.name || '—'}
        </span>
      ),
    },
    {
      key: 'network',
      header: 'Network / format',
      render: (row: QueueRow) => (
        <div>
          <Badge size="xs" variant="neutral">{row.ad_network}</Badge>
          {' '}
          <span style={{ fontSize: F.xs, color: C.dim }}>{row.ad_format}</span>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Submitted',
      render: (row: QueueRow) => (
        <span style={{ fontSize: F.sm, color: C.dim }}>{fmtDate(row.created_at)}</span>
      ),
    },
    {
      key: 'preview',
      header: 'Preview',
      render: (row: QueueRow) => {
        if (row.creative_html) {
          return (
            <iframe
              title={`Preview: ${row.name}`}
              srcDoc={row.creative_html}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              style={{ width: 120, height: 60, border: `1px solid ${C.divider}`, borderRadius: 4 }}
            />
          );
        }
        if (row.creative_url) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.creative_url}
              alt={row.alt_text || 'Preview'}
              style={{ maxWidth: 120, maxHeight: 60, borderRadius: 4, display: 'block', border: `1px solid ${C.divider}` }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          );
        }
        return <span style={{ fontSize: F.xs, color: C.dim }}>No preview</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      align: 'right' as const,
      render: (row: QueueRow) => {
        const isApproving = acting?.id === row.id && acting.action === 'approve';
        const isRejecting = acting?.id === row.id && acting.action === 'reject';
        const busy = acting?.id === row.id;
        return (
          <div style={{ display: 'inline-flex', gap: S[1] }} onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="secondary"
              loading={isApproving}
              disabled={busy}
              onClick={() => act(row.id, 'approve')}
            >
              {isApproving ? 'Approving…' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={isRejecting}
              disabled={busy}
              onClick={() => act(row.id, 'reject')}
              style={{ color: C.danger }}
            >
              {isRejecting ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Creative approval queue"
        subtitle="Ad units pending review before they can serve."
        actions={
          <Button variant="ghost" onClick={() => router.push('/admin/ads/placements')}>
            ← Placements
          </Button>
        }
      />

      <PageSection>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title="No creatives pending review"
              description="All units are approved or rejected."
              cta={
                <Button variant="secondary" onClick={() => router.push('/admin/ads/placements')}>
                  Go to placements
                </Button>
              }
            />
          }
        />
      </PageSection>
    </Page>
  );
}

export default function AdsQueuePage() {
  return <QueueInner />;
}
