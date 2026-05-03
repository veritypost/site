'use client';

/**
 * Newsroom — Discovery + Articles tabs.
 *
 * URL state:
 *   ?tab=discovery|articles      (default 'discovery')
 *   ?view=active|completed       (Discovery tab only, default 'active')
 *   ?panel=runs|costs|cleanup    (Discovery tab tertiary; renders sub-page)
 *   ?dq=…                        (Discovery search query)
 *   ?cat=<uuid>                  (Discovery category filter)
 *   ?so=newest|oldest|…          (Discovery sort)
 *   ?audience=adult,kids…        (Articles tab — handled inside ArticlesTable)
 *   ?status=draft,published…
 *   ?q=…
 *
 * Tabs/panels piggyback on the client-side admin role gate; server-side
 * route auth is the real gate. Permission checks for individual mutations
 * live on the API routes via requirePermission dual-check.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Modal from '@/components/admin/Modal';
import Field from '@/components/admin/Field';
import Select from '@/components/admin/Select';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

import StoryCard, { type StoryCardCluster } from './_components/StoryCard';
import type { SourceItem } from './_components/SourcesBlock';
import type { AudienceBand } from './_components/PipelineStepLabels';
import ArticlesTable from './_components/ArticlesTable';
import RunsSubpage from './_subpages/Runs';
import CostsSubpage from './_subpages/Costs';
import CleanupSubpage from './_subpages/Cleanup';
import { MODEL_OPTIONS } from '@/lib/newsroomModels';

type TabId = 'discovery' | 'articles';
type ViewId = 'active' | 'completed';
type PanelId = 'runs' | 'costs' | 'cleanup';

type ListResponse = {
  clusters: Array<{
    cluster: StoryCardCluster;
    audience_state: Array<{
      cluster_id: string;
      audience_band: AudienceBand;
      state: string;
      article_id: string | null;
      skipped_at: string | null;
      generated_at: string | null;
      updated_at: string | null;
    }>;
    sources: SourceItem[];
    recent_run_per_band: Array<{
      audience_band: AudienceBand;
      id: string;
      status: string | null;
      started_at: string | null;
      completed_at: string | null;
      error_type: string | null;
    } | null>;
  }>;
  cursor: string | null;
};

function parseTab(raw: string | null): TabId {
  return raw === 'articles' ? 'articles' : 'discovery';
}
function parseView(raw: string | null): ViewId {
  return raw === 'completed' ? 'completed' : 'active';
}
function parsePanel(raw: string | null): PanelId | null {
  if (raw === 'runs' || raw === 'costs' || raw === 'cleanup') return raw;
  return null;
}

export default function NewsroomV2Page() {
  return (
    <Suspense fallback={<Page maxWidth={1200}><div style={{ padding: S[6] }}><Spinner /></div></Page>}>
      <NewsroomV2Inner />
    </Suspense>
  );
}

function NewsroomV2Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = parseTab(sp.get('tab'));
  const view = parseView(sp.get('view'));
  const panel = parsePanel(sp.get('panel'));

  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?next=/admin/newsroom');
        return;
      }
      await refreshAllPermissions();
      if (cancelled) return;
      if (!hasPermission('admin.newsroom.view')) {
        router.push('/admin');
        return;
      }
      setAuthorized(true);
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  const writeUrl = useCallback((updates: Partial<Record<'tab' | 'view' | 'panel', string | null>>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, sp]);

  if (!authChecked) {
    return (
      <Page maxWidth={1200}>
        <div style={{ padding: S[6] }}><Spinner /></div>
      </Page>
    );
  }
  if (!authorized) return null;

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Newsroom"
        subtitle="Discovery, articles, and pipeline observability"
      />

      <TabBar
        tabs={[
          { id: 'discovery', label: 'Discovery' },
          { id: 'articles', label: 'Articles' },
        ]}
        active={tab}
        onSelect={(id) => writeUrl({ tab: id, panel: null })}
      />

      {tab === 'discovery' && !panel && (
        <DiscoveryTab view={view} onView={(v) => writeUrl({ view: v })} onPanel={(p) => writeUrl({ panel: p })} />
      )}
      {tab === 'discovery' && panel === 'runs' && <PanelShell title="Pipeline runs" onClose={() => writeUrl({ panel: null })}><RunsSubpage /></PanelShell>}
      {tab === 'discovery' && panel === 'costs' && <PanelShell title="Pipeline costs" onClose={() => writeUrl({ panel: null })}><CostsSubpage /></PanelShell>}
      {tab === 'discovery' && panel === 'cleanup' && <PanelShell title="Cleanup" onClose={() => writeUrl({ panel: null })}><CleanupSubpage /></PanelShell>}
      {tab === 'articles' && <ArticlesTabShell />}
    </Page>
  );
}

function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: Array<{ id: TabId; label: string }>;
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: S[1],
        borderBottom: `1px solid ${C.divider}`,
        marginBottom: S[4],
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${active === t.id ? C.accent : 'transparent'}`,
            padding: `${S[2]}px ${S[3]}px`,
            cursor: 'pointer',
            color: active === t.id ? C.ink : C.dim,
            fontSize: F.md,
            fontWeight: active === t.id ? 600 : 500,
            fontFamily: 'inherit',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S[3] }}>
        <h2 style={{ margin: 0, fontSize: F.lg, color: C.ink }}>{title}</h2>
        <Button onClick={onClose} variant="ghost" size="sm">Close</Button>
      </div>
      <div>{children}</div>
    </div>
  );
}

function DiscoveryTab({
  view,
  onView,
  onPanel,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  onPanel: (p: PanelId) => void;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  // URL filter params
  const [dqInput, setDqInput] = useState(() => sp.get('dq') ?? '');
  const dq = sp.get('dq') ?? '';
  const cat = sp.get('cat') ?? '';
  const so = sp.get('so') ?? '';

  // Existing state
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIngest, setBusyIngest] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  // Merge state
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);

  // Categories for filter select (parent_id powers the subcategory cascade)
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; slug: string; parent_id: string | null }>
  >([]);

  // Global model picker — drives every per-card generate in this Discovery tab
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);

  // Debounce dqInput → URL (only fires when dqInput differs from current URL param)
  useEffect(() => {
    if (dqInput === dq) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (dqInput) params.set('dq', dqInput);
      else params.delete('dq');
      router.replace(`?${params.toString()}`, { scroll: false });
    }, 500);
    return () => clearTimeout(timer);
  }, [dqInput, dq, sp, router]);

  // Load categories once on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('is_active', true)
      .order('name')
      .then(({ data: rows }) => { if (rows) setCategories(rows); });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tab: view, limit: '50' });
      if (dq) params.set('q', dq);
      if (cat) params.set('category', cat);
      if (so) params.set('sort', so);
      const res = await fetch(`/api/admin/newsroom/clusters/list?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        setData({ clusters: [], cursor: null });
        return;
      }
      setData({ clusters: json.clusters ?? [], cursor: json.cursor ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [view, dq, cat, so]);

  useEffect(() => { void reload(); }, [reload]);

  async function runFeed() {
    setBusyIngest(true);
    try {
      const res = await fetch('/api/newsroom/ingest/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 429) {
        toast.push({ message: 'Refreshing too fast. Try again in a moment.', variant: 'warn' });
        return;
      }
      if (res.status === 503) {
        toast.push({
          message: 'Feed ingestion is disabled. Flip ai.ingest_enabled in Pipeline Settings to re-enable.',
          variant: 'warn',
        });
        return;
      }
      await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: 'Could not run feeds.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Feeds refreshed.', variant: 'success' });
      await reload();
    } finally {
      setBusyIngest(false);
    }
  }

  function handleMergeToggle(clusterId: string) {
    setMergeSelected((prev) => {
      if (prev.includes(clusterId)) return prev.filter((id) => id !== clusterId);
      if (prev.length >= 2) return prev;
      return [...prev, clusterId];
    });
  }

  async function handleMerge() {
    if (mergeSelected.length !== 2) return;
    if (mergeSelected[0] === mergeSelected[1]) {
      toast.push({ message: 'Select two different stories.', variant: 'warn' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${mergeSelected[0]}/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_id: mergeSelected[1] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ message: body.error ?? 'Merge failed', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Stories merged.', variant: 'success' });
      setMergeMode(false);
      setMergeSelected([]);
      await reload();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    }
  }

  // The `cat` URL param holds whichever category id (parent or leaf) the
  // operator most recently picked at the most-specific level. The API
  // expands a parent id to itself + descendants, so a parent pick returns
  // every cluster under that branch; a leaf pick narrows to that subcat.
  const catById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; parent_id: string | null }>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);
  const parentCats = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories]
  );
  const picked = cat ? catById.get(cat) ?? null : null;
  const parentVal = picked ? (picked.parent_id ?? picked.id) : '';
  const subVal = picked && picked.parent_id ? picked.id : '';
  const subOptions = useMemo(
    () => (parentVal ? categories.filter((c) => c.parent_id === parentVal) : []),
    [categories, parentVal]
  );

  function setCatParam(value: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('cat', value);
    else params.delete('cat');
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function handleParentCatChange(value: string) {
    setCatParam(value || null);
  }
  function handleSubCatChange(value: string) {
    setCatParam(value || parentVal || null);
  }

  function handleSoChange(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('so', value);
    else params.delete('so');
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const clusters = data?.clusters ?? [];

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: C.bg,
          padding: `${S[3]}px 0`,
          marginBottom: S[2],
          borderBottom: `1px solid ${C.divider}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: S[3],
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], alignItems: 'center' }}>
          <Button onClick={runFeed} disabled={busyIngest} variant="primary" size="sm">
            {busyIngest ? 'Running…' : 'Run Feed'}
          </Button>
          <Button onClick={() => setNewOpen(true)} variant="secondary" size="sm">
            + New article
          </Button>
          <ViewToggle view={view} onView={onView} />
          <Button
            onClick={() => { setMergeMode((v) => !v); setMergeSelected([]); }}
            variant={mergeMode ? 'primary' : 'secondary'}
            size="sm"
          >
            {mergeMode ? 'Cancel merge' : 'Merge stories'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <Button onClick={() => onPanel('runs')} variant="ghost" size="sm">Runs</Button>
          <Button onClick={() => onPanel('costs')} variant="ghost" size="sm">Costs</Button>
          <Button onClick={() => onPanel('cleanup')} variant="ghost" size="sm">Cleanup</Button>
        </div>
      </div>

      {/* Filter row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: S[2],
          marginBottom: S[3],
          alignItems: 'center',
        }}
      >
        <TextInput
          value={dqInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDqInput(e.target.value)}
          placeholder="Search across all feeds (e.g. tigers)"
          style={{ flex: '1 1 200px', minWidth: 160, minHeight: 44, padding: '0 10px' } as React.CSSProperties}
        />
        <Select
          value={parentVal}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleParentCatChange(e.target.value)}
          block={false}
          style={{ minWidth: 140, minHeight: 44 }}
        >
          <option value="">All categories</option>
          {parentCats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        {parentVal && subOptions.length > 0 && (
          <Select
            value={subVal}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSubCatChange(e.target.value)}
            block={false}
            style={{ minWidth: 160, minHeight: 44 }}
            aria-label="Subcategory"
          >
            <option value="">All subcategories</option>
            {subOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
        <Select
          value={so}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSoChange(e.target.value)}
          block={false}
          style={{ minWidth: 140, minHeight: 44 }}
        >
          <option value="">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_sources">Most sources</option>
          <option value="breaking_first">Breaking first</option>
        </Select>
        <Select
          aria-label="Generation model"
          value={String(selectedModelIdx)}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedModelIdx(Number(e.target.value))}
          block={false}
          style={{ minWidth: 180, minHeight: 44 }}
        >
          {MODEL_OPTIONS.map((opt, i) => (
            <option key={opt.model} value={i}>{opt.label}</option>
          ))}
        </Select>
      </div>

      {/* Merge confirmation bar */}
      {mergeMode && mergeSelected.length === 2 && (
        <div
          style={{
            display: 'flex',
            gap: S[2],
            alignItems: 'center',
            padding: `${S[2]}px ${S[3]}px`,
            marginBottom: S[3],
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: F.sm,
            color: C.ink,
          }}
        >
          <span style={{ flex: 1 }}>Merge story 1 into story 2?</span>
          <Button onClick={handleMerge} variant="primary" size="sm">Merge</Button>
          <Button onClick={() => setMergeSelected([])} variant="ghost" size="sm">Clear</Button>
        </div>
      )}

      {error && <div style={{ padding: S[3], color: C.danger, fontSize: F.sm }}>{error}</div>}

      {loading ? (
        <div style={{ padding: S[8], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : clusters.length === 0 ? (
        <EmptyState
          title={view === 'completed' ? 'No completed Stories' : 'No Stories yet'}
          description={
            view === 'completed'
              ? 'Stories appear here once every audience is generated or skipped.'
              : 'Click Run Feed to ingest the latest RSS.'
          }
        />
      ) : (
        <div>
          {clusters.map((row) => (
            <StoryCard
              key={row.cluster.id}
              cluster={row.cluster}
              audienceState={row.audience_state}
              sources={row.sources}
              recentRunPerBand={row.recent_run_per_band}
              mergeMode={mergeMode}
              mergeSelected={mergeSelected.includes(row.cluster.id)}
              onMergeToggle={handleMergeToggle}
              selectedModelIdx={selectedModelIdx}
            />
          ))}
        </div>
      )}

      {newOpen && <NewArticleModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function ViewToggle({ view, onView }: { view: ViewId; onView: (v: ViewId) => void }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        gap: 0,
        border: `1px solid ${C.divider}`,
        borderRadius: 6,
        minHeight: 44,
        overflow: 'hidden',
      }}
    >
      {(['active', 'completed'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: `0 ${S[3]}px`,
            background: view === v ? C.accent : 'transparent',
            color: view === v ? C.bg : C.ink,
            border: 'none',
            cursor: 'pointer',
            fontSize: F.sm,
            fontFamily: 'inherit',
          }}
        >
          {v === 'active' ? 'Active' : 'Completed'}
        </button>
      ))}
    </div>
  );
}

function ArticlesTabShell() {
  const toast = useToast();
  return (
    <PageSection
      title="All articles"
      description="Drafts, published, archived, and failed runs across every audience"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: S[2] }}>
        <Button
          onClick={() =>
            toast.push({ message: 'Use the Discovery tab to launch + New article.', variant: 'warn' })
          }
          variant="ghost"
          size="sm"
        >
          + New article
        </Button>
      </div>
      <ArticlesTable />
    </PageSection>
  );
}

function NewArticleModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [audience, setAudience] = useState<AudienceBand>('adult');
  const [mode, setMode] = useState<'manual' | 'ai_generate'>('manual');
  const [slug, setSlug] = useState('');
  const [sourceUrls, setSourceUrls] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setProgress(null);
    try {
      const body: Record<string, unknown> = { mode, audience };
      if (mode === 'manual') {
        const trimmed = slug.trim();
        if (trimmed.length === 0) {
          toast.push({ message: 'Enter a slug.', variant: 'warn' });
          setBusy(false);
          return;
        }
        body.slug = trimmed;
      } else {
        const urls = sourceUrls
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (urls.length === 0) {
          toast.push({ message: 'Paste at least one source URL.', variant: 'warn' });
          setBusy(false);
          return;
        }
        body.source_urls = urls;
        if (topic.trim().length > 0) body.topic = topic.trim();
      }
      if (mode === 'ai_generate') {
        setProgress('Running pipeline — this may take 1-2 minutes…');
      }
      const res = await fetch('/api/admin/articles/new-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        slug?: string;
        article_id?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.push({ message: json.error ?? `Create failed (${res.status})`, variant: 'danger' });
        return;
      }
      toast.push({ message: mode === 'manual' ? 'Draft created.' : 'Article generated.', variant: 'success' });
      if (mode === 'manual' && json.article_id) {
        const editor = audience === 'adult' ? '/admin/story-manager' : '/admin/kids-story-manager';
        router.push(`${editor}?article=${json.article_id}`);
      } else if (json.slug) {
        router.push(`/${json.slug}`);
      } else {
        onClose();
      }
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="+ New article" onClose={onClose} width="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <Field label="Audience">
          <Select
            value={audience}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAudience(e.target.value as AudienceBand)}
          >
            <option value="adult">Adult</option>
            <option value="tweens">Tweens</option>
            <option value="kids">Kids</option>
          </Select>
        </Field>
        <Field label="Mode">
          <Select
            value={mode}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMode(e.target.value as 'manual' | 'ai_generate')}
          >
            <option value="manual">Manual write — empty draft</option>
            <option value="ai_generate">Generate from sources</option>
          </Select>
        </Field>
        {mode === 'manual' ? (
          <Field label="URL slug (required)" hint="Lowercase letters, numbers, and hyphens. Must be unique.">
            <TextInput
              value={slug}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)}
              placeholder="e.g. my-new-headline"
            />
          </Field>
        ) : (
          <>
            <Field label="Source URLs (one per line)" hint="1–10 URLs the pipeline will draw from.">
              <Textarea
                value={sourceUrls}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSourceUrls(e.target.value)}
                rows={4}
                placeholder={'https://example.com/article\nhttps://other.com/related'}
              />
            </Field>
            <Field label="Topic seed (optional)">
              <TextInput
                value={topic}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopic(e.target.value)}
                placeholder="Short hint for the writer"
              />
            </Field>
          </>
        )}
        {progress && <div style={{ fontSize: F.sm, color: C.dim }}>{progress}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: S[2] }}>
          <Button onClick={onClose} variant="ghost" size="sm" disabled={busy}>Cancel</Button>
          <Button onClick={submit} variant="primary" size="sm" disabled={busy}>
            {busy ? 'Working…' : mode === 'manual' ? 'Create draft' : 'Generate'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
