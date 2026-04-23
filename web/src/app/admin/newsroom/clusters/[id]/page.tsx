/**
 * Phase 4 Task 21 — Cluster detail page /admin/newsroom/clusters/:id
 *
 * Single client component lifted from Task 20 patterns. Renders:
 *   - Cluster header (title, summary, breaking/locked badges, category
 *     name, created/updated relative times, generation_state)
 *   - Discovery items grid (adult discovery_items + kid_discovery_items
 *     unioned per cluster_id, sorted by fetched_at desc; per item:
 *     raw_title, raw_url (external link), outlet from metadata.outlet,
 *     state badge, fetched_at relative)
 *   - Generation history (last 20 pipeline_runs WHERE cluster_id = :id,
 *     desc by started_at; status badge + audience + cost + relative
 *     time + link to /admin/pipeline/runs/:id (Task 27 — not yet built;
 *     renders 404, acceptable scaffold))
 *   - Header actions: Generate (opens Task 22 GenerationModal with
 *     audience picker + freeform instructions + live progress),
 *     Unlock (locked only), Back to newsroom
 *
 * Audience inference: feed_clusters has no audience column. We count
 * items per side (adult vs kid discovery tables) to label the cluster
 * audience-of-record. The Generate modal lets the admin pick either
 * audience regardless — the API rejects if the chosen side has no items
 * (audience_unverifiable / mixed_audience / no-items guards at
 * generate/route.ts L599-635).
 *
 * Data load: Promise.all over five parallel queries (cluster, category,
 * adult items, kid items, runs). Bad UUIDs and missing rows render an
 * EmptyState with a Back link, not a crash.
 *
 * Dependency status:
 *   - Migration 116 (feed_clusters.locked_*, generation_state) — LIVE.
 *   - Migration 116 (admin.pipeline.run_generate / release_cluster_lock
 *     permissions) — LIVE.
 *   - Migration 120 (pipeline_runs.error_type column) — LIVE per
 *     information_schema verification 2026-04-22.
 *   - Task 22: generation modal — LIVE. Header Generate opens
 *     GenerationModal with audience + freeform instructions + polling.
 *   - Task 27: run detail page (history rows nav to
 *     /admin/pipeline/runs/:id which currently 404s).
 *   - Stretch: per-item delete-from-cluster button — deferred to a
 *     future Phase 4 task; needs new endpoint, out of scope here.
 *
 * Auth: client-side ADMIN_ROLES gate matching Task 20 + settings page.
 */

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import GenerationModal from '@/components/admin/GenerationModal';
import PipelineRunPicker, {
  type PickerSelection,
  type PipelineRunPickerHandle,
  estimateClusterCostUsd,
  formatEstimatedCost,
} from '@/components/admin/PipelineRunPicker';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type ClusterRow = Pick<
  Tables<'feed_clusters'>,
  | 'id'
  | 'title'
  | 'summary'
  | 'is_breaking'
  | 'is_active'
  | 'created_at'
  | 'updated_at'
  | 'category_id'
  | 'locked_by'
  | 'locked_at'
  | 'generation_state'
>;

type DiscoveryItem = Pick<
  Tables<'discovery_items'>,
  'id' | 'raw_url' | 'raw_title' | 'raw_body' | 'state' | 'fetched_at' | 'metadata'
>;

type RunRow = Pick<
  Tables<'pipeline_runs'>,
  | 'id'
  | 'status'
  | 'audience'
  | 'started_at'
  | 'completed_at'
  | 'duration_ms'
  | 'total_cost_usd'
  | 'model'
  | 'error_message'
  | 'error_type'
>;

type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name'>;

type ItemWithSource = DiscoveryItem & { source: 'adult' | 'kid' };

const HISTORY_LIMIT = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function outletFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const m = metadata as Record<string, unknown>;
  const outlet = m.outlet;
  if (typeof outlet === 'string' && outlet.trim()) return outlet.trim();
  return '';
}

function statusVariant(
  status: string | null | undefined,
): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  switch ((status || '').toLowerCase()) {
    case 'success':
    case 'completed':
      return 'success';
    case 'running':
    case 'pending':
      return 'info';
    case 'failed':
    case 'error':
      return 'danger';
    case 'cancelled':
    case 'canceled':
      return 'warn';
    default:
      return 'neutral';
  }
}

function formatCost(usd: number | string | null | undefined): string {
  if (usd === null || usd === undefined) return '$0.00';
  const n = typeof usd === 'string' ? parseFloat(usd) : usd;
  if (!Number.isFinite(n)) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function ClusterDetailPage() {
  return (
    <ToastProvider>
      <ClusterDetailInner />
    </ToastProvider>
  );
}

function ClusterDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clusterId = params?.id || '';
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cluster, setCluster] = useState<ClusterRow | null>(null);
  const [category, setCategory] = useState<CategoryRow | null>(null);
  const [items, setItems] = useState<ItemWithSource[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState<string>('');
  // Task 22: one Generate button in the header opens GenerationModal. Kept
  // as a boolean here (not an id) because the cluster is already known from
  // the route.
  const [generateOpen, setGenerateOpen] = useState(false);

  // Page-header PipelineRunPicker (Decision 3.1). Same shape + reset
  // semantics as /admin/newsroom; gates the header Generate button + drives
  // the est. cost preview rendered next to it.
  const pickerRef = useRef<PipelineRunPickerHandle | null>(null);
  const [picker, setPicker] = useState<PickerSelection>({
    provider: '',
    model: '',
    freeformInstructions: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  });
  const onPickerChange = useCallback((sel: PickerSelection) => {
    setPicker(sel);
  }, []);
  const pickerReady = !!picker.provider && !!picker.model;
  const estCost = estimateClusterCostUsd(
    picker.inputPricePer1m,
    picker.outputPricePer1m
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name)
        .filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    // Bad UUID short-circuits before hitting Postgres (which would
    // otherwise return a 22P02 cast error and trip our generic error
    // toast).
    if (!UUID_RE.test(clusterId)) {
      setNotFound(true);
      return;
    }

    const [clusterRes, adultRes, kidRes, runsRes] = await Promise.all([
      supabase
        .from('feed_clusters')
        .select(
          'id, title, summary, is_breaking, is_active, created_at, updated_at, category_id, locked_by, locked_at, generation_state',
        )
        .eq('id', clusterId)
        .maybeSingle(),
      supabase
        .from('discovery_items')
        .select('id, raw_url, raw_title, raw_body, state, fetched_at, metadata')
        .eq('cluster_id', clusterId)
        .order('fetched_at', { ascending: false }),
      supabase
        .from('kid_discovery_items')
        .select('id, raw_url, raw_title, raw_body, state, fetched_at, metadata')
        .eq('cluster_id', clusterId)
        .order('fetched_at', { ascending: false }),
      supabase
        .from('pipeline_runs')
        .select(
          'id, status, audience, started_at, completed_at, duration_ms, total_cost_usd, model, error_message, error_type',
        )
        .eq('cluster_id', clusterId)
        .order('started_at', { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);

    if (clusterRes.error || !clusterRes.data) {
      // Either RLS denied (shouldn't happen for admin) or row missing.
      // Render not-found state regardless; the user gets a Back link.
      setNotFound(true);
      return;
    }

    const c = clusterRes.data as ClusterRow;
    setCluster(c);

    // Category lookup is sequential after cluster (depends on
    // category_id) but it's a single-row read; not worth a second
    // round-trip pre-fetching all categories.
    if (c.category_id) {
      const { data: catRow } = await supabase
        .from('categories')
        .select('id, name')
        .eq('id', c.category_id)
        .maybeSingle();
      if (catRow) setCategory(catRow as CategoryRow);
    }

    const adultItems: ItemWithSource[] = ((adultRes.data || []) as DiscoveryItem[]).map((it) => ({
      ...it,
      source: 'adult' as const,
    }));
    const kidItems: ItemWithSource[] = ((kidRes.data || []) as DiscoveryItem[]).map((it) => ({
      ...it,
      source: 'kid' as const,
    }));
    const merged = [...adultItems, ...kidItems].sort((a, b) => {
      const ta = a.fetched_at ? new Date(a.fetched_at).getTime() : 0;
      const tb = b.fetched_at ? new Date(b.fetched_at).getTime() : 0;
      return tb - ta;
    });
    setItems(merged);

    setRuns((runsRes.data || []) as RunRow[]);
    setNotFound(false);
  }

  function openGenerate() {
    if (!cluster) return;
    setGenerateOpen(true);
  }

  function closeGenerate() {
    setGenerateOpen(false);
  }

  async function unlock() {
    if (!cluster) return;
    setBusy('unlock');
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${cluster.id}/unlock`, {
        method: 'POST',
      });
      if (!res.ok) {
        toast.push({ message: 'Unlock failed.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Cluster unlocked.', variant: 'success' });
      await load();
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading cluster
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  if (notFound || !cluster) {
    return (
      <Page>
        <PageHeader
          title="Cluster not found"
          subtitle="This cluster may have been removed, or the link is invalid."
          backHref="/admin/newsroom"
          backLabel="Newsroom"
        />
        <PageSection>
          <EmptyState
            title="No cluster at this id"
            description="Return to the newsroom to pick an active cluster."
            cta={
              <Link href="/admin/newsroom" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="md">
                  Back to newsroom
                </Button>
              </Link>
            }
          />
        </PageSection>
      </Page>
    );
  }

  const locked = !!cluster.locked_by;
  const adultCount = items.filter((i) => i.source === 'adult').length;
  const kidCount = items.filter((i) => i.source === 'kid').length;
  const audienceLabel =
    adultCount > 0 && kidCount > 0
      ? 'Adult + kid'
      : adultCount > 0
        ? 'Adult'
        : kidCount > 0
          ? 'Kid'
          : 'No items';
  const title = (cluster.title && cluster.title.trim()) || 'Untitled cluster';

  const headerActions = (
    <>
      <Button
        variant="primary"
        size="md"
        disabled={locked || busy !== '' || !pickerReady}
        onClick={openGenerate}
        title={
          locked
            ? 'Cluster is locked; another run is in progress.'
            : !pickerReady
              ? 'Pick a provider and model on the page header first.'
              : undefined
        }
      >
        Generate
      </Button>
      {pickerReady && estCost !== null && (
        <span
          title="Rough estimate from typical token counts × the picked model's price. Real cost varies with article length and source size."
          style={{
            fontSize: F.xs,
            color: ADMIN_C.dim,
            alignSelf: 'center',
          }}
        >
          {formatEstimatedCost(estCost)}
        </span>
      )}
      {locked && (
        <Button
          variant="danger"
          size="md"
          loading={busy === 'unlock'}
          disabled={busy !== ''}
          onClick={unlock}
        >
          Unlock
        </Button>
      )}
      <Link href="/admin/newsroom" style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md">
          Back to newsroom
        </Button>
      </Link>
    </>
  );

  return (
    <Page>
      <PageHeader
        title={title}
        subtitle={
          <span>
            {audienceLabel} · {category ? category.name : 'Uncategorized'} · Updated{' '}
            {relativeTime(cluster.updated_at) || '—'}
          </span>
        }
        actions={headerActions}
        backHref="/admin/newsroom"
        backLabel="Newsroom"
      />

      <PipelineRunPicker ref={pickerRef} onChange={onPickerChange} />

      <PageSection>
        <div
          style={{
            display: 'flex',
            gap: S[2],
            flexWrap: 'wrap',
            marginBottom: S[3],
          }}
        >
          {cluster.is_breaking && (
            <Badge variant="danger" size="sm">
              Breaking
            </Badge>
          )}
          {locked && (
            <span
              title={
                cluster.locked_at
                  ? `Locked ${relativeTime(cluster.locked_at)} (auto-expires after 10 min via RPC TTL)`
                  : 'Cluster is locked; another run is in progress.'
              }
            >
              <Badge variant="warn" size="sm">
                Locked
              </Badge>
            </span>
          )}
          {!cluster.is_active && (
            <Badge variant="ghost" size="sm">
              Inactive
            </Badge>
          )}
          {cluster.generation_state && (
            <Badge variant="info" size="sm">
              {cluster.generation_state}
            </Badge>
          )}
          <Badge variant="neutral" size="sm">
            Created {relativeTime(cluster.created_at) || '—'}
          </Badge>
        </div>

        <div
          style={{
            fontSize: F.md,
            color: ADMIN_C.soft,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {cluster.summary?.trim() || (
            <span style={{ color: ADMIN_C.muted }}>No summary.</span>
          )}
        </div>
      </PageSection>

      <PageSection
        title="Discovery items"
        description={`${items.length} item${items.length === 1 ? '' : 's'} across adult + kid feeds, sorted newest first.`}
      >
        {items.length === 0 ? (
          <EmptyState
            title="No discovery items"
            description="No raw articles have been clustered here yet. Refresh feeds from the newsroom home to ingest."
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: S[3],
            }}
          >
            {items.map((it) => {
              const outlet = outletFromMetadata(it.metadata);
              const itemTitle = (it.raw_title && it.raw_title.trim()) || 'Untitled item';
              const excerpt = truncate(it.raw_body, 180);
              return (
                <div
                  key={`${it.source}:${it.id}`}
                  style={{
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 8,
                    background: ADMIN_C.bg,
                    padding: S[3],
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[2],
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: S[1],
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <Badge
                      variant={it.source === 'kid' ? 'info' : 'neutral'}
                      size="xs"
                    >
                      {it.source === 'kid' ? 'Kid' : 'Adult'}
                    </Badge>
                    <Badge variant="ghost" size="xs">
                      {it.state}
                    </Badge>
                    {outlet && (
                      <Badge variant="neutral" size="xs">
                        {outlet}
                      </Badge>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: F.base,
                      fontWeight: 600,
                      color: ADMIN_C.white,
                      lineHeight: 1.35,
                    }}
                  >
                    {itemTitle}
                  </div>
                  {excerpt && (
                    <div
                      style={{
                        fontSize: F.sm,
                        color: ADMIN_C.dim,
                        lineHeight: 1.5,
                      }}
                    >
                      {excerpt}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: S[2],
                      marginTop: 'auto',
                      fontSize: F.xs,
                      color: ADMIN_C.muted,
                    }}
                  >
                    <span>{relativeTime(it.fetched_at) || '—'}</span>
                    <a
                      href={it.raw_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: ADMIN_C.accent,
                        textDecoration: 'none',
                        fontSize: F.xs,
                      }}
                    >
                      Open source
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageSection>

      <PageSection
        title="Generation history"
        description={
          runs.length >= HISTORY_LIMIT
            ? `Last ${HISTORY_LIMIT} runs (most recent first). Older runs hidden.`
            : `${runs.length} run${runs.length === 1 ? '' : 's'} for this cluster.`
        }
      >
        {runs.length === 0 ? (
          <EmptyState
            title="No generation runs yet"
            description="Click Generate adult or Generate kid above to kick off the first run."
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: S[2],
            }}
          >
            {runs.map((r) => {
              const variant = statusVariant(r.status);
              return (
                <Link
                  key={r.id}
                  href={`/admin/pipeline/runs/${r.id}`}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      border: `1px solid ${ADMIN_C.divider}`,
                      borderRadius: 8,
                      background: ADMIN_C.bg,
                      padding: S[3],
                      display: 'flex',
                      gap: S[3],
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Badge variant={variant} size="sm">
                      {r.status || 'unknown'}
                    </Badge>
                    <Badge
                      variant={r.audience === 'kid' ? 'info' : 'neutral'}
                      size="xs"
                    >
                      {r.audience || 'unknown'}
                    </Badge>
                    <span
                      style={{
                        fontSize: F.sm,
                        color: ADMIN_C.soft,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      {r.id.slice(0, 8)}
                    </span>
                    <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
                      {r.model || '—'}
                    </span>
                    <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
                      {formatCost(r.total_cost_usd)}
                    </span>
                    {r.duration_ms !== null && r.duration_ms !== undefined && (
                      <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
                        {(r.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: F.sm,
                        color: ADMIN_C.muted,
                        marginLeft: 'auto',
                      }}
                    >
                      {relativeTime(r.started_at) || '—'}
                    </span>
                  </div>
                  {r.error_message && (
                    <div
                      style={{
                        fontSize: F.xs,
                        color: ADMIN_C.muted,
                        padding: `${S[1]}px ${S[3]}px 0`,
                        lineHeight: 1.4,
                      }}
                    >
                      {r.error_type ? `[${r.error_type}] ` : ''}
                      {truncate(r.error_message, 200)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </PageSection>

      <GenerationModal
        open={generateOpen}
        clusterId={cluster.id}
        clusterTitle={title}
        provider={picker.provider}
        model={picker.model}
        freeformInstructions={picker.freeformInstructions}
        onClose={closeGenerate}
        onGenerateClick={() => {
          // Decision 3.1 fresh-pick: clear provider, model, and freeform
          // immediately after the modal POSTs.
          pickerRef.current?.reset();
        }}
        onRunSettled={() => {
          // Refresh cluster + runs so the new run appears in history and
          // lock badge updates. Completion navigates to article review so
          // this mostly fires on failure/cancel.
          void load();
        }}
      />
    </Page>
  );
}
