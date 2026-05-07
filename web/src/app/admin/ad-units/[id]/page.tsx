'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import NumberInput from '@/components/admin/NumberInput';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type AdUnit = Tables<'ad_units'>;
type Category = Pick<Tables<'categories'>, 'id' | 'name' | 'slug' | 'parent_id'>;

const NETWORKS = ['direct', 'house', 'google_adsense', 'google_ads', 'amazon', 'other'];
const AD_FORMATS = ['banner', 'interstitial', 'video', 'native'];
const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const PLAN_OPTIONS = ['free', 'verity_plus'];
const PLATFORM_OPTIONS = ['web', 'ios'];

type FormState = Partial<AdUnit> & {
  targeting_categories: string[];
  targeting_subcategories: string[];
  targeting_plans: string[];
  targeting_platforms: string[];
  targeting_countries: string[];
  targeting_cohorts: string[];
};

function parseJsonArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function AdUnitTargetingInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState<AdUnit | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormState>({
    targeting_categories: [],
    targeting_subcategories: [],
    targeting_plans: [],
    targeting_platforms: [],
    targeting_countries: [],
    targeting_cohorts: [],
  });

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

      const [unitRes, catsRes] = await Promise.all([
        supabase.from('ad_units').select('*').eq('id', params.id).single(),
        supabase.from('categories').select('id, name, slug, parent_id').order('name'),
      ]);

      if (unitRes.error || !unitRes.data) {
        push({ message: unitRes.error?.message || 'Ad unit not found', variant: 'danger' });
        router.push('/admin/ad-placements');
        return;
      }
      const u = unitRes.data;
      setUnit(u);
      setCategories(catsRes.data || []);

      const targetCats = parseJsonArray(u.targeting_categories);
      const rawSubs = parseJsonArray(u.targeting_subcategories);
      // Drop any subcategory whose parent is already targeted as a wildcard —
      // legacy rows snapshotted child IDs at parent-check time, which the UI no
      // longer does. The wildcard parent is the single source of truth.
      const wildcardParents = new Set(targetCats);
      const subParentLookup = new Map((catsRes.data || []).map((c) => [c.id, c.parent_id]));
      const targetSubs = rawSubs.filter((subId) => {
        const parentId = subParentLookup.get(subId);
        return !parentId || !wildcardParents.has(parentId);
      });
      // Pre-expand any parent categories that have targeting set on them or their children
      const expanded = new Set<string>();
      for (const id of targetCats) expanded.add(id);
      setExpandedCats(expanded);

      setForm({
        ...u,
        targeting_categories: targetCats,
        targeting_subcategories: targetSubs,
        targeting_plans: parseJsonArray(u.targeting_plans),
        targeting_platforms: parseJsonArray(u.targeting_platforms),
        targeting_countries: (parseJsonArray(u.targeting_countries)).join('\n'),
        targeting_cohorts: (parseJsonArray(u.targeting_cohorts)).join('\n'),
      } as unknown as FormState);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topLevelCats = categories.filter((c) => !c.parent_id);
  const subCatsOf = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const toggleCat = (catId: string) => {
    const cur = new Set(form.targeting_categories);
    if (cur.has(catId)) {
      cur.delete(catId);
      setExpandedCats((prev) => { const next = new Set(prev); next.delete(catId); return next; });
    } else {
      // Parent-checked = wildcard for this category and all current and future
      // children; do not snapshot child IDs into targeting_subcategories.
      cur.add(catId);
      setExpandedCats((prev) => new Set([...prev, catId]));
    }
    setForm({ ...form, targeting_categories: Array.from(cur) });
  };

  const toggleSub = (subId: string) => {
    const cur = new Set(form.targeting_subcategories);
    if (cur.has(subId)) cur.delete(subId); else cur.add(subId);
    setForm({ ...form, targeting_subcategories: Array.from(cur) });
  };

  const toggleCatExpand = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const toggleChip = (field: 'targeting_plans' | 'targeting_platforms', val: string) => {
    const cur = new Set(form[field] as string[]);
    if (cur.has(val)) cur.delete(val); else cur.add(val);
    setForm({ ...form, [field]: Array.from(cur) });
  };

  const save = async () => {
    if (!unit) return;
    setError('');
    setSaving(true);
    try {
      const countriesRaw = (form.targeting_countries as unknown as string) || '';
      const cohortsRaw = (form.targeting_cohorts as unknown as string) || '';
      const body: Record<string, unknown> = {
        name: form.name,
        advertiser_name: form.advertiser_name || null,
        ad_network: form.ad_network,
        ad_network_unit_id: form.ad_network_unit_id || null,
        ad_format: form.ad_format,
        creative_url: form.creative_url || null,
        click_url: form.click_url || null,
        alt_text: form.alt_text || null,
        cta_text: form.cta_text || null,
        creative_html: form.creative_html || null,
        frequency_cap_per_user: form.frequency_cap_per_user ?? null,
        frequency_cap_per_session: form.frequency_cap_per_session ?? null,
        weight: form.weight ?? 100,
        approval_status: form.approval_status,
        is_active: form.is_active,
        targeting_categories: form.targeting_categories.length ? form.targeting_categories : null,
        targeting_subcategories: form.targeting_subcategories.length ? form.targeting_subcategories : null,
        targeting_plans: (form.targeting_plans as string[]).length ? form.targeting_plans : null,
        targeting_platforms: (form.targeting_platforms as string[]).length ? form.targeting_platforms : null,
        targeting_countries: countriesRaw.trim()
          ? countriesRaw.split('\n').map((s: string) => s.trim()).filter(Boolean)
          : null,
        targeting_cohorts: cohortsRaw.trim()
          ? cohortsRaw.split('\n').map((s: string) => s.trim()).filter(Boolean)
          : null,
      };
      const res = await fetch(`/api/admin/ad-units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d?.error || 'Save failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: 'Ad unit saved', variant: 'success' });
    } catch (err) {
      const msg = (err as Error)?.message || 'Save failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally {
      setSaving(false);
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
  if (!authorized || !unit) return null;

  const countriesVal = (form.targeting_countries as unknown as string) ?? '';
  const cohortsVal = (form.targeting_cohorts as unknown as string) ?? '';

  return (
    <Page>
      <PageHeader
        title={unit.name}
        subtitle={`${unit.ad_network} · ${unit.ad_format} · ${unit.approval_status}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push('/admin/ad-placements')}>← Back</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save</Button>
          </>
        }
      />

      {error && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'var(--danger-bg)', border: `1px solid ${C.danger}`,
          color: C.danger, fontSize: F.sm,
        }}>{error}</div>
      )}

      {/* Basic fields */}
      <PageSection title="Creative &amp; settings">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
          <Lbl label="Name">
            <TextInput value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Lbl>
          <Lbl label="Advertiser">
            <TextInput value={form.advertiser_name ?? ''} onChange={(e) => setForm({ ...form, advertiser_name: e.target.value })} />
          </Lbl>
          <Lbl label="Network">
            <Select value={form.ad_network ?? 'direct'} onChange={(e) => setForm({ ...form, ad_network: e.target.value })}>
              {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Format">
            <Select value={form.ad_format ?? 'banner'} onChange={(e) => setForm({ ...form, ad_format: e.target.value })}>
              {AD_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Network unit ID">
            <TextInput value={form.ad_network_unit_id ?? ''} onChange={(e) => setForm({ ...form, ad_network_unit_id: e.target.value })} />
          </Lbl>
          <Lbl label="Creative URL">
            <TextInput value={form.creative_url ?? ''} onChange={(e) => setForm({ ...form, creative_url: e.target.value })} />
          </Lbl>
          <Lbl label="Click URL">
            <TextInput value={form.click_url ?? ''} onChange={(e) => setForm({ ...form, click_url: e.target.value })} />
          </Lbl>
          <Lbl label="Alt text">
            <TextInput value={form.alt_text ?? ''} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} />
          </Lbl>
          <Lbl label="CTA text">
            <TextInput value={form.cta_text ?? ''} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} />
          </Lbl>
          <Lbl label="Freq cap / user">
            <NumberInput
              value={form.frequency_cap_per_user ?? 0}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, frequency_cap_per_user: Number(e.target.value) || 0 })}
            />
          </Lbl>
          <Lbl label="Freq cap / session">
            <NumberInput
              value={form.frequency_cap_per_session ?? 0}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, frequency_cap_per_session: Number(e.target.value) || 0 })}
            />
          </Lbl>
          <Lbl label="Weight">
            <NumberInput
              value={form.weight ?? 100}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, weight: Number(e.target.value) || 0 })}
            />
          </Lbl>
          <Lbl label="Approval">
            <Select value={form.approval_status ?? 'pending'} onChange={(e) => setForm({ ...form, approval_status: e.target.value })}>
              {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Active">
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2], paddingTop: S[1] }}>
              <input
                type="checkbox"
                checked={form.is_active ?? true}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: F.sm, color: C.soft }}>
                {form.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </Lbl>
        </div>
        <div style={{ marginTop: S[3] }}>
          <Lbl label="Creative HTML">
            <Textarea
              rows={3}
              value={form.creative_html ?? ''}
              onChange={(e) => setForm({ ...form, creative_html: e.target.value })}
            />
          </Lbl>
        </div>
      </PageSection>

      {/* Targeting */}
      <PageSection title="Targeting">

        {/* Plans */}
        <div style={{ marginBottom: S[4] }}>
          <Lbl label="Plans (empty = all plans)">
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginTop: S[1] }}>
              {PLAN_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  active={(form.targeting_plans as string[]).includes(p)}
                  onClick={() => toggleChip('targeting_plans', p)}
                />
              ))}
            </div>
          </Lbl>
        </div>

        {/* Platforms */}
        <div style={{ marginBottom: S[4] }}>
          <Lbl label="Platforms (empty = all platforms)">
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginTop: S[1] }}>
              {PLATFORM_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  active={(form.targeting_platforms as string[]).includes(p)}
                  onClick={() => toggleChip('targeting_platforms', p)}
                />
              ))}
            </div>
          </Lbl>
        </div>

        {/* Countries */}
        <div style={{ marginBottom: S[4] }}>
          <Lbl label="Countries (one ISO-2 code per line, empty = all countries)">
            <Textarea
              rows={3}
              value={countriesVal}
              onChange={(e) => setForm({ ...form, targeting_countries: e.target.value as unknown as string[] })}
              placeholder={'US\nCA\nGB'}
            />
          </Lbl>
        </div>

        {/* Cohorts */}
        <div style={{ marginBottom: S[4] }}>
          <Lbl label="Cohorts (one tag per line, empty = all cohorts)">
            <Textarea
              rows={3}
              value={cohortsVal}
              onChange={(e) => setForm({ ...form, targeting_cohorts: e.target.value as unknown as string[] })}
              placeholder={'power_reader\nnews_junkie'}
            />
          </Lbl>
        </div>

        {/* Category tree */}
        <Lbl label="Categories &amp; subcategories (empty = all categories)">
          <div style={{
            marginTop: S[1], border: `1px solid ${C.divider}`, borderRadius: 8,
            maxHeight: 400, overflowY: 'auto',
          }}>
            {topLevelCats.length === 0 && (
              <div style={{ padding: S[3], color: C.dim, fontSize: F.sm }}>No categories available.</div>
            )}
            {topLevelCats.map((cat) => {
              const subs = subCatsOf(cat.id);
              const catSelected = form.targeting_categories.includes(cat.id);
              const isExpanded = expandedCats.has(cat.id);
              return (
                <div key={cat.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: S[2],
                    padding: `${S[2]}px ${S[3]}px`,
                    borderBottom: `1px solid ${C.divider}`,
                    background: catSelected ? C.hover : C.bg,
                  }}>
                    <input
                      type="checkbox"
                      checked={catSelected}
                      onChange={() => toggleCat(cat.id)}
                      style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span
                      style={{ fontSize: F.sm, fontWeight: 600, color: C.ink, flex: 1, cursor: 'pointer' }}
                      onClick={() => toggleCat(cat.id)}
                    >
                      {cat.name}
                    </span>
                    {subs.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => toggleCatExpand(cat.id, e)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: C.dim, fontSize: F.xs, padding: `0 ${S[1]}px`,
                          font: 'inherit',
                        }}
                      >
                        {isExpanded ? '▲' : '▼'} {subs.length}
                      </button>
                    )}
                  </div>
                  {isExpanded && (catSelected ? (
                    <div style={{
                      padding: `${S[2]}px ${S[3]}px ${S[2]}px ${S[6]}px`,
                      borderBottom: `1px solid ${C.divider}`,
                      color: C.dim, fontSize: F.xs, fontStyle: 'italic',
                    }}>
                      All {cat.name} subcategories targeted (current and future).
                    </div>
                  ) : subs.map((sub) => {
                    const subSelected = form.targeting_subcategories.includes(sub.id);
                    return (
                      <div
                        key={sub.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: S[2],
                          padding: `${S[1]}px ${S[3]}px ${S[1]}px ${S[6]}px`,
                          borderBottom: `1px solid ${C.divider}`,
                          background: subSelected ? C.hover : C.bg,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={subSelected}
                          onChange={() => toggleSub(sub.id)}
                          style={{ width: 13, height: 13, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <span
                          style={{ fontSize: F.sm, color: C.soft, cursor: 'pointer' }}
                          onClick={() => toggleSub(sub.id)}
                        >
                          {sub.name}
                        </span>
                      </div>
                    );
                  }))}
                </div>
              );
            })}
          </div>
          {(form.targeting_categories.length > 0 || form.targeting_subcategories.length > 0) && (
            <div style={{ marginTop: S[1], fontSize: F.xs, color: C.dim }}>
              {form.targeting_categories.length} categor{form.targeting_categories.length === 1 ? 'y' : 'ies'},
              {' '}{form.targeting_subcategories.length} subcategor{form.targeting_subcategories.length === 1 ? 'y' : 'ies'} selected
            </div>
          )}
        </Lbl>
      </PageSection>
    </Page>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

export default function AdUnitTargetingPage() {
  return <AdUnitTargetingInner />;
}
