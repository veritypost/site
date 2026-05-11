// Homepage v2 admin editor — click-to-assign over a fixed slot scaffold.
// Two-pane pattern (slot list + per-slot inline search); panel agents
// rejected drag-and-drop in favor of this for accessibility / undo /
// mobile reasons.
//
// Live-status flip lives at the top of the page: one button promotes v2
// or rolls back to v1 (the legacy hardcoded route). Promote also calls
// revalidatePath('/') server-side so visitors see the new layout
// immediately.

'use client';

import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { LayoutRow, SlotKind, SlotRow, SlotSpan } from '@/app/_home_v2/types';

type SearchResult = {
  id: string;
  title: string | null;
  published_at: string | null;
  categories: { name: string | null } | null;
};

const ARTICLE_KINDS: ReadonlySet<SlotKind> = new Set([
  'lead',
  'second_lead',
  'breaking_strip',
  'cluster',
  'list_rail',
  'secondary_pair',
  'wide_strip',
  'editors_picks',
]);

const PAYLOAD_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>([
  'feature',
  'engagement',
  'promo',
]);

const KIND_CAPACITY: Record<SlotKind, number> = {
  lead: 1,
  second_lead: 1,
  breaking_strip: 1,
  cluster: 3,
  list_rail: 8,
  feature: 1,
  engagement: 1,
  promo: 1,
  secondary_pair: 6,
  wide_strip: 1,
  editors_picks: 5,
};

const KIND_LABEL: Record<SlotKind, string> = {
  lead: 'Hero',
  second_lead: 'Second lead',
  breaking_strip: 'Breaking strip',
  cluster: 'Cluster',
  list_rail: 'List rail',
  feature: 'Feature',
  engagement: 'Daily quiz',
  promo: 'Promo',
  secondary_pair: 'Secondary pair',
  wide_strip: 'Wide strip',
  editors_picks: "Editor's picks",
};

const SPAN_OPTIONS: SlotSpan[] = [3, 4, 6, 8, 12];

const SPAN_LABEL: Record<SlotSpan, string> = {
  3: 'Quarter (3)',
  4: 'Third (4)',
  6: 'Half (6)',
  8: 'Two-thirds (8)',
  12: 'Full (12)',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function HomeV2EditorInner() {
  const router = useRouter();
  const supabase = createClient();
  const { push } = useToast();

  const [layout, setLayout] = useState<LayoutRow | null>(null);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  const [openSearch, setOpenSearch] = useState<{
    slotId: string;
    position: number;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Category filter dropdown — null = all categories. Populated once at
  // page mount so the filter is always available without per-slot re-fetch.
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; parent_id: string | null }>
  >([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fetchLayout = useCallback(async () => {
    const res = await fetch('/api/admin/home-v2', { cache: 'no-store' });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Load failed: ${j.error ?? res.statusText}`, variant: 'danger' });
      return;
    }
    const json = (await res.json()) as { layout: LayoutRow; liveSlug: string | null };
    setLayout(json.layout);
    setLiveSlug(json.liveSlug);
  }, [push]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      await refreshAllPermissions();
      if (!hasPermission('admin.home_v2.manage')) {
        router.push('/admin');
        return;
      }
      // Categories list for the filter dropdown — fetched once at mount.
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, parent_id')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true, nullsFirst: false });
      setCategories(
        (catData || []).filter(
          (c) => !c.name?.toLowerCase().startsWith('kids'),
        ) as Array<{ id: string; name: string; parent_id: string | null }>,
      );
      await fetchLayout();
      setLoading(false);
    })();
  }, [router, supabase, fetchLayout]);

  // Article picker query — runs whenever a slot opens, query changes, or
  // category filter changes. Empty query → 20 most-recent matches (no
  // typing required to start browsing); typed query → ilike narrow.
  useEffect(() => {
    if (!openSearch) return;
    const t = setTimeout(async () => {
      setSearching(true);
      let q = supabase
        .from('articles')
        .select(
          'id, title, published_at, categories!fk_articles_category_id(name)',
        )
        .eq('status', 'published')
        .eq('visibility', 'public')
        .is('deleted_at', null);
      if (categoryFilter) {
        q = q.eq('category_id', categoryFilter);
      }
      if (query && query.length >= 1) {
        q = q.ilike('title', `%${query}%`);
      }
      const { data } = await q
        .order('published_at', { ascending: false })
        .limit(20);
      setResults((data || []) as SearchResult[]);
      setSearching(false);
    }, query.length === 0 ? 0 : 250);
    return () => clearTimeout(t);
  }, [query, openSearch, supabase, categoryFilter]);

  const assignArticle = async (slotId: string, position: number, articleId: string) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch('/api/admin/home-v2/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: slotId,
        position,
        content_type: 'article',
        article_id: articleId,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Assign failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Assigned.' });
      setOpenSearch(null);
      setQuery('');
      setResults([]);
      await fetchLayout();
    }
    setMutating(false);
  };

  const clearItem = async (itemId: string) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch(`/api/admin/home-v2/items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Clear failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Cleared.' });
      await fetchLayout();
    }
    setMutating(false);
  };

  const updateSlot = async (slotId: string, patch: { span?: SlotSpan; config?: unknown }) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch(`/api/admin/home-v2/slots/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Slot update failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      await fetchLayout();
    }
    setMutating(false);
  };

  const savePayload = async (
    slot: SlotRow,
    payload: Record<string, unknown>,
  ) => {
    if (mutating) return;
    setMutating(true);
    const contentType =
      slot.kind === 'feature'
        ? 'feature'
        : slot.kind === 'engagement'
          ? 'quiz'
          : 'custom';
    const res = await fetch('/api/admin/home-v2/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: slot.id,
        position: 0,
        content_type: contentType,
        payload,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Save failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Saved.' });
      await fetchLayout();
    }
    setMutating(false);
  };

  const promote = async (target: 'v1' | 'v2') => {
    if (mutating) return;
    if (
      target === 'v2' &&
      !confirm('Make Homepage v2 the live front page? Visitors will see it immediately.')
    )
      return;
    if (
      target === 'v1' &&
      !confirm('Roll back to the legacy v1 homepage? v2 stays as a draft.')
    )
      return;
    setMutating(true);
    const res = await fetch('/api/admin/home-v2/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Flip failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({
        message:
          target === 'v2' ? 'Homepage v2 is now live.' : 'Rolled back to v1.',
      });
      await fetchLayout();
    }
    setMutating(false);
  };

  if (loading || !layout) {
    return (
      <Page maxWidth={960}>
        <div
          style={{
            padding: S[8],
            color: C.dim,
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
          }}
        >
          <Spinner /> <span>Loading…</span>
        </div>
      </Page>
    );
  }

  const isLive = liveSlug === 'v2';

  return (
    <Page maxWidth={960}>
      <PageHeader
        title="Homepage v2"
        subtitle="Templated front page. Fill slots with articles or content blocks; flip the toggle to make v2 the live homepage."
      />

      <PageSection title="Live status">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[4],
            padding: `${S[3]}px 0`,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: F.base, fontWeight: 600, color: C.ink }}>
              {isLive ? 'Homepage v2 is live' : 'Legacy v1 is live'}
            </div>
            <div style={{ fontSize: F.sm, color: C.dim, marginTop: S[1] }}>
              {isLive
                ? 'Visitors see the templated homepage. Roll back to v1 anytime.'
                : 'Visitors see the existing top-stories homepage. Promote to v2 when you’re ready.'}
            </div>
          </div>
          <a
            href="/v2"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: F.sm,
              fontWeight: 600,
              color: C.ink,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              padding: `${S[2]}px ${S[3]}px`,
            }}
          >
            Preview ↗
          </a>
          {isLive ? (
            <Button variant="secondary" onClick={() => promote('v1')} disabled={mutating}>
              Roll back to v1
            </Button>
          ) : (
            <Button variant="primary" onClick={() => promote('v2')} disabled={mutating}>
              Make v2 live
            </Button>
          )}
        </div>
      </PageSection>

      <PageSection
        title="Slots"
        description="Each slot has an editorial role. Pick a width and fill it with articles or a content block. Empty slots are hidden on the public page."
      >
        {layout.slots.map((slot) => (
          <SlotRowEditor
            key={slot.id}
            slot={slot}
            mutating={mutating}
            openSearch={openSearch}
            query={query}
            results={results}
            searching={searching}
            categories={categories}
            categoryFilter={categoryFilter}
            onChangeCategoryFilter={setCategoryFilter}
            onOpenSearch={(position) => {
              const open =
                openSearch?.slotId === slot.id && openSearch.position === position;
              setOpenSearch(open ? null : { slotId: slot.id, position });
              setQuery('');
              setResults([]);
            }}
            onChangeQuery={setQuery}
            onAssign={assignArticle}
            onClear={clearItem}
            onSpanChange={(span) => updateSlot(slot.id, { span })}
            onSavePayload={(payload) => savePayload(slot, payload)}
          />
        ))}
      </PageSection>
    </Page>
  );
}

function SlotRowEditor({
  slot,
  mutating,
  openSearch,
  query,
  results,
  searching,
  categories,
  categoryFilter,
  onChangeCategoryFilter,
  onOpenSearch,
  onChangeQuery,
  onAssign,
  onClear,
  onSpanChange,
  onSavePayload,
}: {
  slot: SlotRow;
  mutating: boolean;
  openSearch: { slotId: string; position: number } | null;
  query: string;
  results: SearchResult[];
  searching: boolean;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
  categoryFilter: string | null;
  onChangeCategoryFilter: (id: string | null) => void;
  onOpenSearch: (position: number) => void;
  onChangeQuery: (q: string) => void;
  onAssign: (slotId: string, position: number, articleId: string) => void;
  onClear: (itemId: string) => void;
  onSpanChange: (span: SlotSpan) => void;
  onSavePayload: (payload: Record<string, unknown>) => void;
}) {
  const capacity = KIND_CAPACITY[slot.kind];
  const positions = Array.from({ length: capacity }, (_, i) => i);

  return (
    <div
      style={{
        padding: `${S[4]}px 0`,
        borderBottom: `1px solid ${C.divider}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: S[3],
          marginBottom: S[2],
        }}
      >
        <span
          style={{
            fontSize: F.lg,
            fontWeight: 700,
            color: C.ink,
          }}
        >
          {KIND_LABEL[slot.kind]}
        </span>
        <span style={{ fontSize: F.sm, color: C.dim }}>{slot.key}</span>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: F.sm, color: C.dim }}>
          Width&nbsp;
          <select
            value={slot.span}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              onSpanChange(Number(e.target.value) as SlotSpan)
            }
            disabled={mutating}
            style={{
              fontSize: F.sm,
              padding: `${S[1]}px ${S[2]}px`,
              border: `1px solid ${C.divider}`,
              borderRadius: 4,
              background: C.bg,
              color: C.ink,
            }}
          >
            {SPAN_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SPAN_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ARTICLE_KINDS.has(slot.kind) && (
        <div>
          {positions.map((pos) => {
            const item = slot.items.find((i) => i.position === pos);
            const story = item?.article;
            const isOpen =
              openSearch?.slotId === slot.id && openSearch.position === pos;
            return (
              <div
                key={pos}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: S[3],
                  padding: `${S[2]}px 0`,
                  borderTop: pos === 0 ? 'none' : `1px dashed ${C.divider}`,
                }}
              >
                <div
                  style={{
                    width: 24,
                    fontSize: F.sm,
                    fontWeight: 600,
                    color: C.muted,
                    flexShrink: 0,
                    paddingTop: 4,
                    textAlign: 'center',
                  }}
                >
                  {pos + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {story ? (
                    <div>
                      <div
                        style={{
                          fontSize: F.base,
                          fontWeight: 600,
                          color: C.ink,
                          lineHeight: 1.3,
                        }}
                      >
                        {story.title}
                      </div>
                      <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>
                        {formatDate(story.published_at ?? null)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: F.sm, color: C.muted, fontStyle: 'italic' }}>
                      Empty
                    </div>
                  )}

                  {isOpen && (
                    <div style={{ marginTop: S[3] }}>
                      <div style={{ display: 'flex', gap: S[2], marginBottom: S[2] }}>
                        <select
                          value={categoryFilter ?? ''}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            onChangeCategoryFilter(e.target.value || null)
                          }
                          disabled={mutating}
                          style={{
                            fontSize: F.sm,
                            padding: `${S[2]}px ${S[2]}px`,
                            border: `1px solid ${C.divider}`,
                            borderRadius: 4,
                            background: C.bg,
                            color: C.ink,
                            minWidth: 160,
                          }}
                        >
                          <option value="">All sections</option>
                          {categories
                            .filter((c) => c.parent_id === null)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                        <div style={{ flex: 1 }}>
                          <TextInput
                            value={query}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              onChangeQuery(e.target.value)
                            }
                            placeholder="Type to filter, or pick from below…"
                            autoFocus
                          />
                        </div>
                      </div>
                      {!searching && results.length === 0 && query.length === 0 && (
                        <div
                          style={{
                            padding: `${S[2]}px 0`,
                            color: C.muted,
                            fontSize: F.sm,
                          }}
                        >
                          No published articles match this filter.
                        </div>
                      )}
                      {searching && (
                        <div
                          style={{
                            padding: `${S[2]}px 0`,
                            color: C.dim,
                            fontSize: F.sm,
                            display: 'flex',
                            alignItems: 'center',
                            gap: S[2],
                          }}
                        >
                          <Spinner /> Loading…
                        </div>
                      )}
                      {!searching && results.length === 0 && query.length >= 1 && (
                        <div
                          style={{
                            padding: `${S[2]}px 0`,
                            color: C.muted,
                            fontSize: F.sm,
                          }}
                        >
                          No results.
                        </div>
                      )}
                      {!searching && results.length > 0 && query.length === 0 && (
                        <div
                          style={{
                            padding: `${S[1]}px 0`,
                            color: C.dim,
                            fontSize: F.sm,
                          }}
                        >
                          {categoryFilter ? 'Recent in section' : 'Most recent'}
                        </div>
                      )}
                      {results.map((r) => (
                        <div
                          key={r.id}
                          onClick={() => onAssign(slot.id, pos, r.id)}
                          style={{
                            padding: `${S[2]}px ${S[3]}px`,
                            marginTop: S[1],
                            cursor: 'pointer',
                            borderRadius: 4,
                            border: `1px solid ${C.divider}`,
                            background: C.bg,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.hover;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = C.bg;
                          }}
                        >
                          <div style={{ fontSize: F.base, color: C.ink, fontWeight: 500 }}>
                            {r.title}
                          </div>
                          <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>
                            {r.categories?.name ? `${r.categories.name} · ` : ''}
                            {formatDate(r.published_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: S[2], flexShrink: 0 }}>
                  <Button
                    size="sm"
                    variant={isOpen ? 'primary' : 'secondary'}
                    onClick={() => onOpenSearch(pos)}
                    disabled={mutating}
                  >
                    {isOpen ? 'Cancel' : story ? 'Change' : 'Pick'}
                  </Button>
                  {story && item && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onClear(item.id)}
                      disabled={mutating}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {PAYLOAD_KINDS.has(slot.kind) && (
        <PayloadEditor
          slot={slot}
          mutating={mutating}
          onSave={onSavePayload}
        />
      )}
    </div>
  );
}

function PayloadEditor({
  slot,
  mutating,
  onSave,
}: {
  slot: SlotRow;
  mutating: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const item = slot.items.find((i) => i.content_type !== 'article');
  const initial = (item?.payload ?? {}) as Record<string, unknown>;

  const fields: Array<{ key: string; label: string; multiline?: boolean }> =
    slot.kind === 'feature'
      ? [
          { key: 'label', label: 'Label' },
          { key: 'body', label: 'Body', multiline: true },
        ]
      : slot.kind === 'engagement'
        ? [
            { key: 'label', label: 'Label' },
            { key: 'prompt', label: 'Prompt', multiline: true },
            { key: 'href', label: 'Link URL' },
            { key: 'cta', label: 'Button text' },
          ]
        : [
            { key: 'label', label: 'Label' },
            { key: 'heading', label: 'Heading' },
            { key: 'body', label: 'Body', multiline: true },
            { key: 'href', label: 'Link URL' },
            { key: 'cta', label: 'Button text' },
          ];

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      v[f.key] = typeof initial[f.key] === 'string' ? (initial[f.key] as string) : '';
    }
    return v;
  });

  const setField = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], paddingTop: S[2] }}>
      {fields.map((f) => (
        <label key={f.key} style={{ display: 'block' }}>
          <span style={{ fontSize: F.sm, color: C.dim, display: 'block', marginBottom: S[1] }}>
            {f.label}
          </span>
          {f.multiline ? (
            <textarea
              value={values[f.key]}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setField(f.key, e.target.value)}
              rows={3}
              style={{
                width: '100%',
                fontSize: F.base,
                padding: `${S[2]}px ${S[3]}px`,
                border: `1px solid ${C.divider}`,
                borderRadius: 4,
                background: C.bg,
                color: C.ink,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          ) : (
            <TextInput
              value={values[f.key]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setField(f.key, e.target.value)}
            />
          )}
        </label>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: S[2] }}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const payload: Record<string, unknown> = {};
            for (const f of fields) {
              if (values[f.key]) payload[f.key] = values[f.key];
            }
            onSave(payload);
          }}
          disabled={mutating}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

export default function HomeV2EditorPage() {
  return <HomeV2EditorInner />;
}
