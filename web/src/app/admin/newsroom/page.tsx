'use client';

/**
 * Newsroom — Discovery + Articles tabs.
 *
 * URL state:
 *   ?tab=discovery|articles      (default 'discovery')
 *   ?view=active|completed       (Discovery tab only, default 'active')
 *   ?panel=runs|costs|cleanup    (Discovery tab tertiary; renders sub-page)
 *   ?audience=adult,kids…        (Articles tab — handled inside ArticlesTable)
 *   ?status=draft,published…
 *   ?q=…
 *
 * Tabs/panels piggyback on the client-side admin role gate; server-side
 * route auth is the real gate. Permission checks for individual mutations
 * live on the API routes via requirePermission dual-check.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

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
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roles = (userRoles || [])
        .map((r: { roles: { name: string } | { name: string }[] | null }) => {
          const rel = r.roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];
      if (cancelled) return;
      if (roles.some((r) => ADMIN_ROLES.has(r))) {
        setAuthorized(true);
      } else {
        router.push('/');
      }
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
            color: active === t.id ? C.white : C.dim,
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
        <h2 style={{ margin: 0, fontSize: F.lg, color: C.white }}>{title}</h2>
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
  const toast = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIngest, setBusyIngest] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/list?tab=${view}&limit=50`);
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
  }, [view]);

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

  const clusters = data?.clusters ?? [];

  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: C.bg,
          padding: `${S[3]}px 0`,
          marginBottom: S[3],
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
        </div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <Button onClick={() => onPanel('runs')} variant="ghost" size="sm">Runs</Button>
          <Button onClick={() => onPanel('costs')} variant="ghost" size="sm">Costs</Button>
          <Button onClick={() => onPanel('cleanup')} variant="ghost" size="sm">Cleanup</Button>
        </div>
      </div>

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
    <div style={{ display: 'inline-flex', gap: 0, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
      {(['active', 'completed'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            background: view === v ? C.accent : 'transparent',
            color: view === v ? C.bg : C.white,
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
  return (
    <PageSection
      title="All articles"
      description="Drafts, published, archived, and failed runs across every audience"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: S[2] }}>
        <Button onClick={() => alert('Use the Discovery tab to launch + New article.')} variant="ghost" size="sm">
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
        if (slug.trim().length > 0) body.slug = slug.trim();
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
      if (json.slug) {
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
            <option value="ai_generate">AI generate from sources</option>
          </Select>
        </Field>
        {mode === 'manual' ? (
          <Field label="URL slug (optional)" hint="Leave blank for an auto-suffixed slug.">
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
