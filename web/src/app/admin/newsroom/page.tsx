/**
 * Phase 4 Task 20 — Newsroom home page /admin/newsroom
 *
 * Lists active feed_clusters as cards. Per card:
 *   - Breaking / Locked badges, title (fallback "Untitled cluster")
 *   - Summary (200-char truncate)
 *   - Relative time
 *   - Generate button — opens Task 22 GenerationModal (audience picker +
 *     freeform instructions + live progress polling). Disabled if locked.
 *   - Unlock button (only if locked_by != null)
 *   - View link -> /admin/newsroom/clusters/:id (Task 21 detail page)
 *
 * Header:
 *   - Refresh feeds -> POST /api/newsroom/ingest/run
 *   - Pipeline runs -> navigate to /admin/pipeline
 *
 * Dependency status:
 *   - Migration 116 (feed_clusters.locked_* columns) — LIVE.
 *   - Migration 116 (admin.pipeline.run_generate permission) — LIVE.
 *   - Migration 118 (persist_generated_article RPC) — LIVE.
 *   - Migration 120 (pipeline_runs.error_type column) — STAGED. Generate
 *     POST errors on cleanup writes until applied + types regenerated.
 *   - Task 21: cluster detail page (View button 404s).
 *   - Task 22: generation modal — LIVE. Per-card Generate button opens
 *     GenerationModal with audience picker + freeform instructions +
 *     live polling. Replaces the inline "Generate adult" / "Generate
 *     kid" split. Completion redirects to Task 23 article review
 *     (/admin/articles/:id/review — currently 404 scaffold).
 *   - Task 27: run detail page (success-navigate path lands on /admin/pipeline/runs/:id 404).
 *
 * Auth: client-side ADMIN_ROLES gate matching settings page.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type ClusterRow = Pick<
  Tables<'feed_clusters'>,
  'id' | 'title' | 'summary' | 'is_breaking' | 'created_at' | 'updated_at'
>;
// feed_clusters has locked_by + locked_at (migration 116, live — NOT a
// locked_until column; lock expiry is computed inside the RPC via
// locked_at + TTL). For card UI we only need locked_by to toggle the
// Locked badge + Unlock button. locked_at is rendered as a tooltip so
// admin sees how long a lock has been held.
type ClusterWithLock = ClusterRow & {
  locked_by?: string | null;
  locked_at?: string | null;
};

const PAGE_SIZE = 20;

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

export default function NewsroomAdminPage() {
  return (
    <ToastProvider>
      <NewsroomAdminInner />
    </ToastProvider>
  );
}

function NewsroomAdminInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [clusters, setClusters] = useState<ClusterWithLock[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState<string>('');
  const [busyRefresh, setBusyRefresh] = useState(false);

  // Task 22: single Generate button per card opens this modal, which handles
  // audience choice + freeform instructions + live progress. We track the
  // target cluster here instead of inside GenerationModal so closing + reopening
  // against a different cluster is a clean remount (modal resets state on
  // `open` or `clusterId` change).
  const [genTarget, setGenTarget] = useState<{ id: string; title: string } | null>(null);

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
      await load(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(reset: boolean) {
    if (reset) setOffset(0);
    const nextOffset = reset ? 0 : offset;
    if (!reset) setLoadingMore(true);

    try {
      const { data: rows, error } = await supabase
        .from('feed_clusters')
        .select('id, title, summary, is_breaking, created_at, updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .range(nextOffset, nextOffset + PAGE_SIZE - 1);

      if (error) {
        setLoadError(true);
        if (reset) setClusters([]);
        toast.push({ message: 'Could not load clusters.', variant: 'danger' });
        setHasMore(false);
        return;
      }

      const baseRows: ClusterRow[] = (rows || []) as ClusterRow[];
      const ids = baseRows.map((r) => r.id);
      const lockMap: Record<
        string,
        { locked_by: string | null; locked_at: string | null }
      > = {};

      if (ids.length > 0) {
        const { data: lockData, error: lockErr } = await supabase
          .from('feed_clusters')
          .select('id, locked_by, locked_at')
          .in('id', ids);
        if (!lockErr && lockData) {
          for (const l of lockData) {
            lockMap[l.id] = { locked_by: l.locked_by, locked_at: l.locked_at };
          }
        }
        // If lockErr surfaces we silently degrade: cards render without
        // lock badges and Generate stays enabled. feed_clusters.locked_*
        // columns are live (migration 116) so this is defensive only.
      }

      const merged: ClusterWithLock[] = baseRows.map((r) => ({
        ...r,
        ...(lockMap[r.id] || {}),
      }));

      setClusters((prev) => (reset ? merged : [...prev, ...merged]));
      setHasMore(baseRows.length === PAGE_SIZE);
      setOffset(nextOffset + PAGE_SIZE);
      setLoadError(false);
    } finally {
      if (!reset) setLoadingMore(false);
    }
  }

  async function refreshFeeds() {
    setBusyRefresh(true);
    try {
      const res = await fetch('/api/newsroom/ingest/run', { method: 'POST' });
      if (res.status === 429) {
        toast.push({
          message: 'Refreshing too fast. Try again in a moment.',
          variant: 'warn',
        });
        return;
      }
      await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: 'Could not refresh feeds.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Feeds refreshed.', variant: 'success' });
      await load(true);
    } finally {
      setBusyRefresh(false);
    }
  }

  function openGenerate(cluster_id: string, cluster_title: string) {
    setGenTarget({ id: cluster_id, title: cluster_title });
  }

  function closeGenerate() {
    setGenTarget(null);
  }

  async function unlock(cluster_id: string) {
    const key = `${cluster_id}:unlock`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${cluster_id}/unlock`, {
        method: 'POST',
      });
      if (!res.ok) {
        toast.push({ message: 'Unlock failed.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Cluster unlocked.', variant: 'success' });
      await load(true);
    } finally {
      setBusyId('');
    }
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading newsroom
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const headerActions = (
    <>
      <Button
        variant="secondary"
        size="md"
        loading={busyRefresh}
        onClick={refreshFeeds}
      >
        Refresh feeds
      </Button>
      <Link href="/admin/pipeline" style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md">
          Pipeline runs
        </Button>
      </Link>
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Newsroom"
        subtitle="Active clusters from ingest. Open Generate to pick audience and kick off a run."
        actions={headerActions}
      />

      <PageSection>
        {loadError && clusters.length === 0 ? (
          <EmptyState
            title="Could not load clusters"
            description="Something went wrong fetching the active cluster list. Try refreshing feeds or reload the page."
          />
        ) : clusters.length === 0 ? (
          <EmptyState
            title="No active clusters"
            description="Click Refresh feeds to ingest. New clusters appear here as they form."
          />
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: S[4],
              }}
            >
              {clusters.map((c) => {
                const locked = !!c.locked_by;
                const unlockKey = `${c.id}:unlock`;
                const title = (c.title && c.title.trim()) || 'Untitled cluster';
                return (
                  <div
                    key={c.id}
                    style={{
                      border: `1px solid ${ADMIN_C.divider}`,
                      borderRadius: 8,
                      background: ADMIN_C.bg,
                      padding: S[4],
                      display: 'flex',
                      flexDirection: 'column',
                      gap: S[2],
                      minHeight: 200,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: S[2],
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      {c.is_breaking && (
                        <Badge variant="danger" size="xs">
                          Breaking
                        </Badge>
                      )}
                      {locked && (
                        <span
                          title={
                            c.locked_at
                              ? `Locked ${relativeTime(c.locked_at)} (auto-expires after 10 min via RPC TTL)`
                              : 'Cluster is locked; another run is in progress.'
                          }
                        >
                          <Badge variant="warn" size="xs">
                            Locked
                          </Badge>
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: F.md,
                        fontWeight: 600,
                        color: ADMIN_C.white,
                        lineHeight: 1.3,
                      }}
                    >
                      {title}
                    </div>

                    <div
                      style={{
                        fontSize: F.sm,
                        color: ADMIN_C.dim,
                        lineHeight: 1.5,
                        flex: 1,
                      }}
                    >
                      {truncate(c.summary, 200) || (
                        <span style={{ color: ADMIN_C.muted }}>No summary.</span>
                      )}
                    </div>

                    <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
                      Updated {relativeTime(c.updated_at) || '—'}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: S[2],
                        flexWrap: 'wrap',
                        marginTop: S[1],
                      }}
                    >
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={locked || busyId !== ''}
                        onClick={() => openGenerate(c.id, title)}
                        title={
                          locked ? 'Cluster is locked; another run is in progress.' : undefined
                        }
                      >
                        Generate
                      </Button>
                      {locked && (
                        <Button
                          variant="danger"
                          size="sm"
                          loading={busyId === unlockKey}
                          disabled={busyId !== ''}
                          onClick={() => unlock(c.id)}
                        >
                          Unlock
                        </Button>
                      )}
                      <Link
                        href={`/admin/newsroom/clusters/${c.id}`}
                        style={{ textDecoration: 'none', marginLeft: 'auto' }}
                      >
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: S[6],
                }}
              >
                <Button
                  variant="secondary"
                  size="md"
                  loading={loadingMore}
                  disabled={loadingMore}
                  onClick={() => load(false)}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </PageSection>

      <GenerationModal
        open={genTarget !== null}
        clusterId={genTarget?.id ?? ''}
        clusterTitle={genTarget?.title ?? null}
        onClose={closeGenerate}
        onRunSettled={() => {
          // Refresh to pick up lock + generation_state changes. Completion
          // navigates to the article review page so this mostly fires on
          // failure/cancel.
          void load(true);
        }}
      />
    </Page>
  );
}
