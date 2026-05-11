'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import DataTable from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type AdUnit = Tables<'ad_units'>;
type Placement = Tables<'ad_placements'>;
type Campaign = Tables<'ad_campaigns'>;

function UnitsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [units, setUnits] = useState<AdUnit[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [placementFilter, setPlacementFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');

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
      await loadAll();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [unitsRes, placementsRes, campaignsRes] = await Promise.all([
      fetch('/api/admin/ad-units'),
      fetch('/api/admin/ad-placements'),
      fetch('/api/admin/ad-campaigns'),
    ]);
    const [u, p, c] = await Promise.all([
      unitsRes.json().catch(() => ({})),
      placementsRes.json().catch(() => ({})),
      campaignsRes.json().catch(() => ({})),
    ]);
    if (unitsRes.ok) setUnits(u.units || []);
    else push({ message: u?.error || 'Failed to load ad units', variant: 'danger' });
    if (placementsRes.ok) setPlacements(p.placements || []);
    if (campaignsRes.ok) setCampaigns(c.campaigns || []);
  }

  const placementById = useMemo(() => {
    const m = new Map<string, Placement>();
    placements.forEach((p) => m.set(p.id, p));
    return m;
  }, [placements]);

  const campaignById = useMemo(() => {
    const m = new Map<string, Campaign>();
    campaigns.forEach((c) => m.set(c.id, c));
    return m;
  }, [campaigns]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return units.filter((u) => {
      if (placementFilter && u.placement_id !== placementFilter) return false;
      if (campaignFilter === '__none__' ? !!u.campaign_id : campaignFilter && u.campaign_id !== campaignFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'paused' && u.is_active) return false;
      if (approvalFilter && u.approval_status !== approvalFilter) return false;
      if (s) {
        const hay = [
          u.name,
          u.advertiser_name,
          u.ad_network,
          u.ad_format,
          placementById.get(u.placement_id)?.display_name,
          placementById.get(u.placement_id)?.name,
          u.campaign_id ? campaignById.get(u.campaign_id)?.name : null,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [units, search, placementFilter, campaignFilter, statusFilter, approvalFilter, placementById, campaignById]);

  async function toggleActive(u: AdUnit) {
    setTogglingId(u.id);
    try {
      const res = await fetch(`/api/admin/ad-units/${u.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: d?.error || 'Toggle failed', variant: 'danger' });
        return;
      }
      push({ message: u.is_active ? 'Ad paused' : 'Ad activated', variant: 'success' });
      await loadAll();
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }
  if (!authorized) return null;

  const liveCount = units.filter((u) => u.is_active && u.approval_status === 'approved').length;
  const pausedCount = units.filter((u) => !u.is_active).length;
  const pendingCount = units.filter((u) => u.approval_status === 'pending').length;

  const statusVariant = (u: AdUnit): 'success' | 'neutral' | 'warn' | 'danger' => {
    if (!u.is_active) return 'warn';
    if (u.approval_status === 'pending') return 'neutral';
    if (u.approval_status === 'rejected') return 'danger';
    return 'success';
  };
  const statusLabel = (u: AdUnit) => {
    if (!u.is_active) return 'paused';
    if (u.approval_status === 'pending') return 'pending';
    if (u.approval_status === 'rejected') return 'rejected';
    return 'live';
  };

  const cols = [
    {
      key: 'name', header: 'Ad unit', truncate: true,
      render: (r: AdUnit) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: F.xs, color: C.dim }}>
            {r.advertiser_name || '—'} · {r.ad_network} · {r.ad_format}
          </div>
        </div>
      ),
    },
    {
      key: 'placement', header: 'Placement',
      render: (r: AdUnit) => {
        const p = placementById.get(r.placement_id);
        return p ? (
          <div>
            <div style={{ fontSize: F.sm }}>{p.display_name || p.name}</div>
            <div style={{ fontSize: F.xs, color: C.dim }}>{p.page} · {p.name}</div>
          </div>
        ) : '—';
      },
    },
    {
      key: 'campaign', header: 'Campaign',
      render: (r: AdUnit) => {
        if (r.campaign_id) return campaignById.get(r.campaign_id)?.name || '—';
        return <span style={{ color: C.dim, fontStyle: 'italic' }}>Third-party</span>;
      },
    },
    {
      key: 'status', header: 'Status',
      render: (r: AdUnit) => <Badge variant={statusVariant(r)} dot size="xs">{statusLabel(r)}</Badge>,
    },
    {
      key: 'actions', header: '', sortable: false, align: 'right' as const,
      render: (r: AdUnit) => (
        <div style={{ display: 'inline-flex', gap: S[1] }} onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            loading={togglingId === r.id}
            onClick={() => toggleActive(r)}
          >
            {r.is_active ? 'Pause' : 'Activate'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/ads/units/${r.id}`)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Ad units"
        subtitle={`${units.length} total · ${liveCount} live · ${pausedCount} paused · ${pendingCount} pending approval`}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push('/admin/ads/placements')}>Placements</Button>
            <Button variant="secondary" onClick={() => router.push('/admin/ads/campaigns')}>Campaigns</Button>
          </>
        }
      />

      <PageSection>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 2fr) repeat(4, minmax(140px, 1fr))',
          gap: S[2],
          marginBottom: S[3],
        }}>
          <TextInput
            placeholder="Search name, advertiser, placement…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={placementFilter} onChange={(e) => setPlacementFilter(e.target.value)}>
            <option value="">All placements</option>
            {placements.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name || p.name}</option>
            ))}
          </Select>
          <Select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
            <option value="">All ads</option>
            <option value="__none__">Third-party only</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>Our: {c.name}</option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
          <Select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
            <option value="">Any approval</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/admin/ads/units/${r.id}`)}
          empty={
            <EmptyState
              title={units.length ? 'No ad units match' : 'No ad units yet'}
              description={
                units.length
                  ? 'Loosen the filters or clear search.'
                  : 'Create ad units from a placement or from the slot editor in /admin/home.'
              }
              cta={
                <Button variant="primary" onClick={() => router.push('/admin/ads/placements')}>
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

export default function UnitsAdmin() {
  return <UnitsInner />;
}
