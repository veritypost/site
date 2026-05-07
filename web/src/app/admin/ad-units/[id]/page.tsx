'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
// Plan tiers from `plans.tier`. `verity_plus` was a stale form value that
// matched no row and silently targeted nothing.
const PLAN_OPTIONS = ['free', 'verity', 'verity_pro', 'verity_family'];

type TargetType = 'category' | 'subcategory' | 'article';
type TargetMode = 'include' | 'exclude';
type AdTarget = { target_type: TargetType; target_id: string; mode: TargetMode };

type FormState = Partial<AdUnit> & {
  targeting_plans: string[];
  adTargets: AdTarget[];
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
  const [articleTitleCache, setArticleTitleCache] = useState<Record<string, string>>({});
  const [articleQuery, setArticleQuery] = useState('');
  const [articleResults, setArticleResults] = useState<Array<{ id: string; title: string }>>([]);
  const [articleSearching, setArticleSearching] = useState(false);
  const [form, setForm] = useState<FormState>({
    targeting_plans: [],
    adTargets: [],
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

      const [unitRes, catsRes, targetsRes] = await Promise.all([
        supabase.from('ad_units').select('*').eq('id', params.id).single(),
        supabase.from('categories').select('id, name, slug, parent_id').is('deleted_at', null).order('name'),
        supabase.from('ad_targets').select('target_type, target_id, mode').eq('ad_unit_id', params.id),
      ]);

      if (unitRes.error || !unitRes.data) {
        push({ message: unitRes.error?.message || 'Ad unit not found', variant: 'danger' });
        router.push('/admin/ad-placements');
        return;
      }
      const u = unitRes.data;
      setUnit(u);
      setCategories(catsRes.data || []);

      const targets: AdTarget[] = (targetsRes.data || []).map((t) => ({
        target_type: t.target_type as TargetType,
        target_id: t.target_id,
        mode: t.mode as TargetMode,
      }));

      // Pre-expand categories that have either parent-level or child-level
      // targeting set, so the operator sees their selections without clicking.
      const expanded = new Set<string>();
      for (const t of targets) {
        if (t.target_type === 'category') expanded.add(t.target_id);
        if (t.target_type === 'subcategory') {
          const sub = (catsRes.data || []).find((c) => c.id === t.target_id);
          if (sub?.parent_id) expanded.add(sub.parent_id);
        }
      }
      setExpandedCats(expanded);

      // Fetch titles for any articles already targeted, so they render with
      // a label instead of a bare UUID in the selected list.
      const articleIds = targets.filter((t) => t.target_type === 'article').map((t) => t.target_id);
      if (articleIds.length) {
        const { data: arts } = await supabase.from('articles').select('id, title').in('id', articleIds);
        const cache: Record<string, string> = {};
        for (const a of arts || []) cache[a.id] = a.title;
        setArticleTitleCache(cache);
      }

      setForm({
        ...u,
        targeting_plans: parseJsonArray(u.targeting_plans),
        adTargets: targets,
      } as unknown as FormState);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topLevelCats = categories.filter((c) => !c.parent_id);
  const subCatsOf = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const isTargeted = (target_type: TargetType, target_id: string) =>
    form.adTargets.some((t) => t.target_type === target_type && t.target_id === target_id && t.mode === 'include');

  const toggleTarget = (target_type: TargetType, target_id: string) => {
    setForm((f) => {
      const exists = f.adTargets.some(
        (t) => t.target_type === target_type && t.target_id === target_id && t.mode === 'include',
      );
      const adTargets = exists
        ? f.adTargets.filter((t) => !(t.target_type === target_type && t.target_id === target_id && t.mode === 'include'))
        : [...f.adTargets, { target_type, target_id, mode: 'include' as const }];
      return { ...f, adTargets };
    });
  };

  const toggleCategoryTarget = (catId: string) => {
    toggleTarget('category', catId);
    if (!isTargeted('category', catId)) {
      setExpandedCats((prev) => new Set([...prev, catId]));
    }
  };

  const toggleCatExpand = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const toggleChip = (field: 'targeting_plans', val: string) => {
    const cur = new Set(form[field] as string[]);
    if (cur.has(val)) cur.delete(val); else cur.add(val);
    setForm({ ...form, [field]: Array.from(cur) });
  };

  const addArticleTarget = (article: { id: string; title: string }) => {
    if (isTargeted('article', article.id)) return;
    setArticleTitleCache((c) => ({ ...c, [article.id]: article.title }));
    setForm((f) => ({
      ...f,
      adTargets: [...f.adTargets, { target_type: 'article', target_id: article.id, mode: 'include' }],
    }));
    setArticleQuery('');
    setArticleResults([]);
  };

  const removeArticleTarget = (articleId: string) => {
    setForm((f) => ({
      ...f,
      adTargets: f.adTargets.filter((t) => !(t.target_type === 'article' && t.target_id === articleId)),
    }));
  };

  // Debounced article search. 300ms window; cleared when query empties.
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = articleQuery.trim();
    if (!q) {
      setArticleResults([]);
      setArticleSearching(false);
      return;
    }
    setArticleSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('articles')
        .select('id, title')
        .ilike('title', `%${q}%`)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(25);
      setArticleResults(data || []);
      setArticleSearching(false);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [articleQuery, supabase]);

  const save = async () => {
    if (!unit) return;
    setError('');
    setSaving(true);
    try {
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
        targeting_plans: form.targeting_plans.length ? form.targeting_plans : null,
        ad_targets: form.adTargets,
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

  const articleTargets = form.adTargets.filter((t) => t.target_type === 'article' && t.mode === 'include');

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

        <div style={{ marginBottom: S[3], padding: S[2], background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 6, fontSize: F.xs, color: C.dim }}>
          Empty targeting = serve everywhere. Add a category, subcategory, or specific article to narrow.
        </div>

        {/* Plans */}
        <div style={{ marginBottom: S[4] }}>
          <Lbl label="Plans (empty = all plans)">
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginTop: S[1] }}>
              {PLAN_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  active={form.targeting_plans.includes(p)}
                  onClick={() => toggleChip('targeting_plans', p)}
                />
              ))}
            </div>
          </Lbl>
        </div>

        {/* Categories &amp; subcategories */}
        <div style={{ marginBottom: S[4] }}>
          <Lbl label="Categories &amp; subcategories">
            <div style={{
              marginTop: S[1], border: `1px solid ${C.divider}`, borderRadius: 8,
              maxHeight: 400, overflowY: 'auto',
            }}>
              {topLevelCats.length === 0 && (
                <div style={{ padding: S[3], color: C.dim, fontSize: F.sm }}>No categories available.</div>
              )}
              {topLevelCats.map((cat) => {
                const subs = subCatsOf(cat.id);
                const catSelected = isTargeted('category', cat.id);
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
                        onChange={() => toggleCategoryTarget(cat.id)}
                        style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span
                        style={{ fontSize: F.sm, fontWeight: 600, color: C.ink, flex: 1, cursor: 'pointer' }}
                        onClick={() => toggleCategoryTarget(cat.id)}
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
                      const subSelected = isTargeted('subcategory', sub.id);
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
                            onChange={() => toggleTarget('subcategory', sub.id)}
                            style={{ width: 13, height: 13, cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span
                            style={{ fontSize: F.sm, color: C.soft, cursor: 'pointer' }}
                            onClick={() => toggleTarget('subcategory', sub.id)}
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
          </Lbl>
        </div>

        {/* Specific articles */}
        <div>
          <Lbl label="Specific articles (optional)">
            {articleTargets.length > 0 && (
              <div style={{ marginTop: S[1], display: 'flex', flexDirection: 'column', gap: S[1] }}>
                {articleTargets.map((t) => (
                  <div key={t.target_id} style={{
                    display: 'flex', alignItems: 'center', gap: S[2],
                    padding: `${S[1]}px ${S[2]}px`, background: C.hover,
                    border: `1px solid ${C.divider}`, borderRadius: 6,
                  }}>
                    <span style={{ flex: 1, fontSize: F.sm, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {articleTitleCache[t.target_id] || t.target_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeArticleTarget(t.target_id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: C.dim, fontSize: F.xs, font: 'inherit',
                      }}
                    >Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: S[2], position: 'relative' }}>
              <TextInput
                value={articleQuery}
                placeholder="Search articles by title…"
                onChange={(e) => setArticleQuery(e.target.value)}
              />
              {articleQuery.trim() && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  marginTop: S[1], maxHeight: 320, overflowY: 'auto',
                  background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}>
                  {articleSearching && (
                    <div style={{ padding: S[2], color: C.dim, fontSize: F.xs }}>Searching…</div>
                  )}
                  {!articleSearching && articleResults.length === 0 && (
                    <div style={{ padding: S[2], color: C.dim, fontSize: F.xs }}>No matches.</div>
                  )}
                  {articleResults.map((a) => {
                    const already = isTargeted('article', a.id);
                    return (
                      <div
                        key={a.id}
                        onClick={() => !already && addArticleTarget(a)}
                        style={{
                          padding: `${S[1]}px ${S[2]}px`,
                          borderBottom: `1px solid ${C.divider}`,
                          fontSize: F.sm, color: already ? C.dim : C.ink,
                          cursor: already ? 'default' : 'pointer',
                          background: 'transparent',
                        }}
                      >
                        {a.title}{already ? ' · already targeted' : ''}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Lbl>
        </div>

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
