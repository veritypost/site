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

import { Suspense, useCallback, useEffect, useState } from 'react';
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
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

import type { AudienceBand } from './_components/PipelineStepLabels';
import ArticlesTable from './_components/ArticlesTable';
import StoriesList from './_components/StoriesList';
import RunsSubpage from './_subpages/Runs';
import CostsSubpage from './_subpages/Costs';
import CleanupSubpage from './_subpages/Cleanup';
import Research from './_subpages/Research';
import { MODEL_OPTIONS } from '@/lib/newsroomModels';

type TabId = 'discovery' | 'articles';
type PanelId = 'runs' | 'costs' | 'cleanup';

function parseTab(raw: string | null): TabId {
  return raw === 'articles' ? 'articles' : 'discovery';
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

  const writeUrl = useCallback((updates: Partial<Record<'tab' | 'panel', string | null>>) => {
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
        <DiscoveryTab onPanel={(p) => writeUrl({ panel: p })} />
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

function DiscoveryTab({ onPanel }: { onPanel: (p: PanelId) => void }) {
  const [newOpen, setNewOpen] = useState(false);

  // Global model picker — passed to the StoryDetailDrawer so per-band
  // Generate from a story uses the operator's chosen model.
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);

  return (
    <div>
      {/* Wave 4 — Run Feed Research panel. */}
      <Research onJobComplete={() => {}} />

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
          <Button onClick={() => setNewOpen(true)} variant="secondary" size="sm">
            + New article
          </Button>
          <Select
            aria-label="Generation model"
            value={String(selectedModelIdx)}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedModelIdx(Number(e.target.value))}
            block={false}
            style={{ minWidth: 180, minHeight: 40 }}
          >
            {MODEL_OPTIONS.map((opt, i) => (
              <option key={opt.model} value={i}>{opt.label}</option>
            ))}
          </Select>
        </div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <Button onClick={() => onPanel('runs')} variant="ghost" size="sm">Runs</Button>
          <Button onClick={() => onPanel('costs')} variant="ghost" size="sm">Costs</Button>
          <Button onClick={() => onPanel('cleanup')} variant="ghost" size="sm">Cleanup</Button>
        </div>
      </div>

      {/* Wave 5 — Stream E Stories list rebuild */}
      <StoriesList selectedModelIdx={selectedModelIdx} />

      {newOpen && <NewArticleModal onClose={() => setNewOpen(false)} />}
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
