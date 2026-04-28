'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import NumberInput from '@/components/admin/NumberInput';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Placement = Tables<'ad_placements'>;
type AdUnit = Tables<'ad_units'>;

// T319 — `verity_family_xl` was retired 2026-04-27; the per-kid add-on
// model on `verity_family` replaced it.
const ALL_TIERS = ['free', 'verity', 'verity_pro', 'verity_family'];
const PLACEMENT_TYPES = ['banner', 'interstitial', 'in_feed', 'sidebar', 'video'];
const PLATFORMS = ['all', 'web', 'ios', 'android'];
const NETWORKS = ['direct', 'house', 'google_ads', 'amazon', 'other'];
const AD_FORMATS = ['banner', 'interstitial', 'video', 'native'];
const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

type PlacementForm = Partial<Placement> & { id?: string };
type UnitForm = Partial<AdUnit> & { id?: string };

type DestructiveState = {
  title: string; message: string; confirmText: string; confirmLabel: string;
  reasonRequired: boolean; action: string; targetTable: string | null; targetId: string | null;
  oldValue: unknown; newValue: unknown; run: (ctx: { reason?: string }) => Promise<void>;
};

function PlacementsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [units, setUnits] = useState<AdUnit[]>([]);
  const [selected, setSelected] = useState<Placement | null>(null);
  const [placementEditing, setPlacementEditing] = useState<'new' | Placement | null>(null);
  const [placementForm, setPlacementForm] = useState<PlacementForm>({});
  const [unitEditing, setUnitEditing] = useState<'new' | AdUnit | null>(null);
  const [unitForm, setUnitForm] = useState<UnitForm>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [destructive, setDestructive] = useState<DestructiveState | null>(null);

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
      await loadPlacements();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlacements() {
    const res = await fetch('/api/admin/ad-placements');
    const d = await res.json().catch(() => ({}));
    if (res.ok) setPlacements(d.placements || []);
    else push({ message: d?.error || 'Failed to load placements', variant: 'danger' });
  }
  async function loadUnits(placementId: string) {
    const res = await fetch(`/api/admin/ad-units?placement_id=${placementId}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) setUnits(d.units || []);
    else push({ message: d?.error || 'Failed to load units', variant: 'danger' });
  }

  const selectPlacement = (p: Placement) => { setSelected(p); loadUnits(p.id); setPlacementEditing(null); setUnitEditing(null); };

  const startNewPlacement = () => {
    setPlacementForm({
      name: '', display_name: '', placement_type: 'banner', platform: 'web',
      page: 'article', position: 'bottom',
      hidden_for_tiers: ['verity_pro', 'verity_family'],
      reduced_for_tiers: ['verity'],
      max_ads_per_page: 1, is_kids_safe: false,
    });
    setPlacementEditing('new');
  };
  const startEditPlacement = (p: Placement) => { setPlacementForm({ ...p }); setPlacementEditing(p); };

  const savePlacement = async () => {
    setError('');
    if (!placementForm.name?.trim()) { setError('Key name is required'); return; }
    if (!placementForm.display_name?.trim()) { setError('Display name is required'); return; }
    setSaving(true);
    try {
      const isNew = placementEditing === 'new';
      const url = isNew ? '/api/admin/ad-placements' : `/api/admin/ad-placements/${placementForm.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(placementForm),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d?.error || 'Save failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: isNew ? 'Placement created' : 'Placement updated', variant: 'success' });
      setPlacementEditing(null);
      await loadPlacements();
    } catch (err) {
      const msg = (err as Error)?.message || 'Save failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally { setSaving(false); }
  };

  const deletePlacement = (p: Placement) => {
    setDestructive({
      title: `Delete placement "${p.display_name || p.name}"?`,
      message: 'All ad units associated with this placement are removed as well. This is irreversible.',
      confirmText: p.name,
      confirmLabel: 'Delete placement',
      reasonRequired: false,
      action: 'ad_placement.delete',
      targetTable: 'ad_placements',
      targetId: p.id,
      oldValue: { name: p.name, display_name: p.display_name, placement_type: p.placement_type, platform: p.platform, page: p.page, position: p.position },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/ad-placements/${p.id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        push({ message: 'Placement deleted', variant: 'success' });
        setSelected(null);
        await loadPlacements();
      },
    });
  };

  const startNewUnit = () => {
    if (!selected) return;
    setUnitForm({
      name: '', ad_network: 'direct', ad_format: 'banner',
      placement_id: selected.id, weight: 100,
      approval_status: 'approved', is_active: true,
    });
    setUnitEditing('new');
  };
  const startEditUnit = (u: AdUnit) => { setUnitForm({ ...u }); setUnitEditing(u); };

  const saveUnit = async () => {
    setError('');
    if (!unitForm.name?.trim()) { setError('Unit name is required'); return; }
    setSaving(true);
    try {
      const isNew = unitEditing === 'new';
      const url = isNew ? '/api/admin/ad-units' : `/api/admin/ad-units/${unitForm.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unitForm),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d?.error || 'Save failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: isNew ? 'Ad unit created' : 'Ad unit updated', variant: 'success' });
      setUnitEditing(null);
      if (selected) await loadUnits(selected.id);
    } catch (err) {
      const msg = (err as Error)?.message || 'Save failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally { setSaving(false); }
  };

  const deleteUnit = (u: AdUnit) => {
    setDestructive({
      title: `Delete ad unit "${u.name}"?`,
      message: 'This removes the ad unit creative and its placement association. Served-impression history is not affected.',
      confirmText: u.name,
      confirmLabel: 'Delete ad unit',
      reasonRequired: false,
      action: 'ad_unit.delete',
      targetTable: 'ad_units',
      targetId: u.id,
      oldValue: { id: u.id, name: u.name, placement_id: u.placement_id },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/ad-units/${u.id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        push({ message: 'Ad unit deleted', variant: 'success' });
        if (selected) await loadUnits(selected.id);
      },
    });
  };

  const toggleTier = (field: 'hidden_for_tiers' | 'reduced_for_tiers', tier: string) => {
    const cur = new Set((placementForm[field] as string[]) || []);
    if (cur.has(tier)) cur.delete(tier); else cur.add(tier);
    setPlacementForm({ ...placementForm, [field]: Array.from(cur) });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }
  if (!authorized) return null;

  return (
    <Page>
      <PageHeader
        title="Ad placements & units"
        subtitle="Where ads appear, which creatives serve, and how they're gated by tier."
        actions={<Button variant="primary" onClick={startNewPlacement}>New placement</Button>}
      />

      {error && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>{error}</div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(240px, 280px) 1fr', gap: S[4],
        alignItems: 'start',
      }} className="vp-placements-layout">
        <style>{`
          @media (max-width: 720px) {
            .vp-placements-layout { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div>
          <PageSection title="Placements" divider={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
              {placements.length === 0 && (
                <EmptyState
                  title="No placements"
                  description="Create a placement to get started."
                  size="sm"
                  cta={<Button size="sm" variant="primary" onClick={startNewPlacement}>New placement</Button>}
                />
              )}
              {placements.map((p) => {
                const isSel = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectPlacement(p)}
                    style={{
                      textAlign: 'left', padding: `${S[2]}px ${S[3]}px`, borderRadius: 8,
                      border: `1px solid ${isSel ? C.accent : C.divider}`,
                      background: isSel ? C.hover : C.bg,
                      cursor: 'pointer', font: 'inherit', color: C.white, width: '100%',
                    }}
                  >
                    <div style={{ fontSize: F.base, fontWeight: 600 }}>{p.display_name || p.name}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>
                      {p.page} · {p.position} · {p.placement_type}
                    </div>
                  </button>
                );
              })}
            </div>
          </PageSection>
        </div>

        <div>
          {selected ? (
            <>
              <PageSection
                title={selected.display_name || selected.name}
                description={`/${selected.name} · ${selected.page}:${selected.position} · ${selected.placement_type}`}
                aside={
                  <>
                    <Button size="sm" variant="secondary" onClick={() => startEditPlacement(selected)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => deletePlacement(selected)} style={{ color: C.danger }}>Delete</Button>
                  </>
                }
                boxed
              >
                <div style={{ fontSize: F.sm, color: C.dim, lineHeight: 1.6 }}>
                  <div>Hidden for: {(selected.hidden_for_tiers || []).join(', ') || 'none'}</div>
                  <div>Reduced for: {(selected.reduced_for_tiers || []).join(', ') || 'none'}</div>
                </div>
              </PageSection>

              <PageSection
                title={`Ad units (${units.length})`}
                aside={<Button size="sm" variant="secondary" onClick={startNewUnit}>New unit</Button>}
              >
                {units.length === 0 ? (
                  <EmptyState
                    title="No units"
                    description="Add a creative to serve in this placement."
                    size="sm"
                    cta={<Button variant="primary" size="sm" onClick={startNewUnit}>New unit</Button>}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                    {units.map((u) => (
                      <div key={u.id} style={{
                        display: 'flex', alignItems: 'center', gap: S[2],
                        padding: `${S[2]}px ${S[3]}px`, borderRadius: 8,
                        border: `1px solid ${C.divider}`, background: C.bg,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: F.base, fontWeight: 600 }}>{u.name}</div>
                          <div style={{ fontSize: F.xs, color: C.dim }}>
                            {u.ad_network} · {u.ad_format} · weight {u.weight}
                          </div>
                        </div>
                        <Badge
                          size="xs"
                          variant={u.approval_status === 'approved' ? 'success' : u.approval_status === 'rejected' ? 'danger' : 'warn'}
                        >
                          {u.approval_status}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => startEditUnit(u)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteUnit(u)} style={{ color: C.danger }}>Del</Button>
                      </div>
                    ))}
                  </div>
                )}
              </PageSection>
            </>
          ) : (
            <EmptyState
              title="No placement selected"
              description="Pick a placement from the list, or create a new one."
              cta={<Button variant="primary" onClick={startNewPlacement}>New placement</Button>}
            />
          )}
        </div>
      </div>

      {/* Placement drawer */}
      <Drawer
        open={!!placementEditing}
        onClose={() => setPlacementEditing(null)}
        title={placementEditing === 'new' ? 'New placement' : 'Edit placement'}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlacementEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={savePlacement}>Save</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: S[3] }}>
          <Lbl label="Key name">
            <TextInput value={placementForm.name ?? ''} onChange={(e) => setPlacementForm({ ...placementForm, name: e.target.value })} />
          </Lbl>
          <Lbl label="Display name">
            <TextInput value={placementForm.display_name ?? ''} onChange={(e) => setPlacementForm({ ...placementForm, display_name: e.target.value })} />
          </Lbl>
          <Lbl label="Page">
            <TextInput value={placementForm.page ?? ''} onChange={(e) => setPlacementForm({ ...placementForm, page: e.target.value })} />
          </Lbl>
          <Lbl label="Position">
            <TextInput value={placementForm.position ?? ''} onChange={(e) => setPlacementForm({ ...placementForm, position: e.target.value })} />
          </Lbl>
          <Lbl label="Type">
            <Select value={placementForm.placement_type ?? ''} onChange={(e) => setPlacementForm({ ...placementForm, placement_type: e.target.value })}>
              {PLACEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Platform">
            <Select value={placementForm.platform ?? ''} onChange={(e) => setPlacementForm({ ...placementForm, platform: e.target.value })}>
              {PLATFORMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
        </div>
        <div style={{ marginTop: S[4] }}>
          <Lbl label="Hidden for tiers (these tiers never see this placement)">
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
              {ALL_TIERS.map((t) => <TierChip key={t} label={t} active={(placementForm.hidden_for_tiers || []).includes(t)} onClick={() => toggleTier('hidden_for_tiers', t)} />)}
            </div>
          </Lbl>
        </div>
        <div style={{ marginTop: S[3] }}>
          <Lbl label="Reduced-frequency tiers (freq caps halved)">
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
              {ALL_TIERS.map((t) => <TierChip key={t} label={t} active={(placementForm.reduced_for_tiers || []).includes(t)} onClick={() => toggleTier('reduced_for_tiers', t)} />)}
            </div>
          </Lbl>
        </div>
      </Drawer>

      {/* Unit drawer */}
      <Drawer
        open={!!unitEditing}
        onClose={() => setUnitEditing(null)}
        title={unitEditing === 'new' ? 'New ad unit' : 'Edit ad unit'}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnitEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveUnit}>Save unit</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: S[3] }}>
          <Lbl label="Name">
            <TextInput value={unitForm.name ?? ''} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} />
          </Lbl>
          <Lbl label="Advertiser">
            <TextInput value={unitForm.advertiser_name ?? ''} onChange={(e) => setUnitForm({ ...unitForm, advertiser_name: e.target.value })} />
          </Lbl>
          <Lbl label="Network">
            <Select value={unitForm.ad_network ?? ''} onChange={(e) => setUnitForm({ ...unitForm, ad_network: e.target.value })}>
              {NETWORKS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Format">
            <Select value={unitForm.ad_format ?? ''} onChange={(e) => setUnitForm({ ...unitForm, ad_format: e.target.value })}>
              {AD_FORMATS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Creative URL (image)">
            <TextInput value={unitForm.creative_url ?? ''} onChange={(e) => setUnitForm({ ...unitForm, creative_url: e.target.value })} />
          </Lbl>
          <Lbl label="Click URL">
            <TextInput value={unitForm.click_url ?? ''} onChange={(e) => setUnitForm({ ...unitForm, click_url: e.target.value })} />
          </Lbl>
          <Lbl label="Alt text">
            <TextInput value={unitForm.alt_text ?? ''} onChange={(e) => setUnitForm({ ...unitForm, alt_text: e.target.value })} />
          </Lbl>
          <Lbl label="CTA text">
            <TextInput value={unitForm.cta_text ?? ''} onChange={(e) => setUnitForm({ ...unitForm, cta_text: e.target.value })} />
          </Lbl>
          <Lbl label="Freq cap / user">
            <NumberInput value={unitForm.frequency_cap_per_user ?? 0} onChange={(e: ChangeEvent<HTMLInputElement>) => setUnitForm({ ...unitForm, frequency_cap_per_user: Number(e.target.value) || 0 })} />
          </Lbl>
          <Lbl label="Freq cap / session">
            <NumberInput value={unitForm.frequency_cap_per_session ?? 0} onChange={(e: ChangeEvent<HTMLInputElement>) => setUnitForm({ ...unitForm, frequency_cap_per_session: Number(e.target.value) || 0 })} />
          </Lbl>
          <Lbl label="Weight">
            <NumberInput value={unitForm.weight ?? 100} onChange={(e: ChangeEvent<HTMLInputElement>) => setUnitForm({ ...unitForm, weight: Number(e.target.value) || 0 })} />
          </Lbl>
          <Lbl label="Approval">
            <Select value={unitForm.approval_status ?? 'pending'} onChange={(e) => setUnitForm({ ...unitForm, approval_status: e.target.value })}>
              {APPROVAL_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
        </div>
        <div style={{ marginTop: S[4] }}>
          <Lbl label="Creative HTML (for network-served)">
            <Textarea rows={3} value={unitForm.creative_html ?? ''} onChange={(e) => setUnitForm({ ...unitForm, creative_html: e.target.value })} />
          </Lbl>
        </div>
      </Drawer>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch { push({ message: `Couldn't ${destructive?.confirmLabel?.toLowerCase() || 'finish that action'}. Please try again.`, variant: 'danger' }); setDestructive(null); }
        }}
      />
    </Page>
  );
}

function TierChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `${S[1]}px ${S[3]}px`, borderRadius: 999,
        border: `1px solid ${active ? C.accent : C.divider}`,
        background: active ? C.accent : 'transparent',
        color: active ? '#fff' : C.soft,
        fontSize: F.xs, fontWeight: 600, cursor: 'pointer', font: 'inherit',
      }}
    >{label}</button>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
        color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</label>
      {children}
    </div>
  );
}

export default function PlacementsAdmin() {
  return (
    <ToastProvider>
      <PlacementsInner />
    </ToastProvider>
  );
}
