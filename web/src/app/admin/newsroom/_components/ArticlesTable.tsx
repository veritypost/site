'use client';

/**
 * Articles tab — single table over /api/admin/articles/list.
 *
 * Filters sync to URL querystring (Decision 18):
 *   ?audience=adult,kids&status=draft,published&q=trump
 *
 * Default sort: articles.updated_at DESC.
 * Default audience filter (if no querystring): all 3 bands.
 * Default status filter (if no querystring): draft + published.
 *
 * Bulk actions intentionally absent (deferred per Decision 18).
 * Permission gate is enforced server-side; this component renders for
 * any admin who already passed the page-level admin role check.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Badge from '@/components/admin/Badge';
import Button from '@/components/admin/Button';
import Spinner from '@/components/admin/Spinner';
import TextInput from '@/components/admin/TextInput';
import EmptyState from '@/components/admin/EmptyState';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

type AudienceBand = 'adult' | 'tweens' | 'kids';
type ArticleStatus = 'draft' | 'published' | 'archived' | 'failed';

type ArticleRow = {
  id: string;
  title: string | null;
  stories: { slug: string | null } | null;
  status: ArticleStatus;
  age_band: AudienceBand;
  category_id: string | null;
  author_id: string | null;
  published_at: string | null;
  updated_at: string | null;
  is_ai_generated: boolean | null;
  browse_only: boolean;
  view_count: number | null;
  is_breaking: boolean;
  is_kids_safe: boolean;
  deleted_at: string | null;
  story_id: string | null;
  categories: { name: string | null } | null;
  users: { username: string | null } | null;
};

const ALL_BANDS: AudienceBand[] = ['adult', 'tweens', 'kids'];
const ALL_STATUSES: ArticleStatus[] = ['draft', 'published', 'archived', 'failed'];

function parseCsvParam<T extends string>(value: string | null, allowed: T[]): T[] | null {
  if (value == null) return null;
  if (value === '') return [];
  const parts = value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is T => (allowed as string[]).includes(s));
  return parts;
}

function formatStatus(status: ArticleStatus): { label: string; variant: 'success' | 'warn' | 'neutral' | 'danger' } {
  switch (status) {
    case 'published':
      return { label: 'Published', variant: 'success' };
    case 'draft':
      return { label: 'Draft', variant: 'neutral' };
    case 'archived':
      return { label: 'Archived', variant: 'warn' };
    case 'failed':
      return { label: 'Failed', variant: 'danger' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export default function ArticlesTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClient();

  // Selected filters resolve from the querystring on every render —
  // single source of truth.
  const audienceParam = parseCsvParam<AudienceBand>(sp.get('audience'), ALL_BANDS);
  const statusParam = parseCsvParam<ArticleStatus>(sp.get('status'), ALL_STATUSES);
  const audience = audienceParam ?? ALL_BANDS;
  const status = statusParam ?? (['draft', 'published'] as ArticleStatus[]);
  const q = sp.get('q') ?? '';

  const [draftQ, setDraftQ] = useState(q);
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [browseOnlyId, setBrowseOnlyId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    readCount: number;
    commentCount: number;
  } | null>(null);

  const writeUrl = useCallback(
    (next: { audience?: AudienceBand[]; status?: ArticleStatus[]; q?: string }) => {
      const params = new URLSearchParams(sp.toString());
      if (next.audience !== undefined) {
        if (next.audience.length === 0 || next.audience.length === ALL_BANDS.length) {
          params.delete('audience');
        } else {
          params.set('audience', next.audience.join(','));
        }
      }
      if (next.status !== undefined) {
        if (next.status.length === 0) params.delete('status');
        else params.set('status', next.status.join(','));
      }
      if (next.q !== undefined) {
        if (next.q.trim().length === 0) params.delete('q');
        else params.set('q', next.q.trim());
      }
      const qs = params.toString();
      router.replace(`?${qs}`, { scroll: false });
    },
    [router, sp]
  );

  const toggleAudience = (band: AudienceBand) => {
    const set = new Set(audience);
    if (set.has(band)) set.delete(band);
    else set.add(band);
    writeUrl({ audience: ALL_BANDS.filter((b) => set.has(b)) });
  };
  const toggleStatus = (s: ArticleStatus) => {
    const set = new Set(status);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    writeUrl({ status: ALL_STATUSES.filter((x) => set.has(x)) });
  };

  // Submit search on Enter or after a 500ms idle.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draftQ.trim() === q.trim()) return;
      writeUrl({ q: draftQ });
    }, 500);
    return () => clearTimeout(t);
  }, [draftQ, q, writeUrl]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (audience.length > 0 && audience.length !== ALL_BANDS.length) {
      params.set('audience', audience.join(','));
    } else if (audience.length === 0) {
      params.set('audience', '');
    }
    if (status.length > 0) {
      params.set('status', status.join(','));
    }
    if (q.trim().length > 0) params.set('q', q.trim());
    return params.toString();
  }, [audience, status, q]);

  // Load list when filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCursor(null);
    fetch(`/api/admin/articles/list?${queryString}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          articles?: ArticleRow[];
          cursor?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Load failed (${res.status})`);
          setRows([]);
          return;
        }
        setRows(json.articles ?? []);
        setCursor(json.cursor ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [queryString]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(queryString);
      params.set('cursor', cursor);
      const res = await fetch(`/api/admin/articles/list?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as {
        articles?: ArticleRow[];
        cursor?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        return;
      }
      setRows((prev) => [...prev, ...(json.articles ?? [])]);
      setCursor(json.cursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoadingMore(false);
    }
  };

  // -------------------------------------------------------------------------
  // Action handlers — all mutations go through the PATCH/DELETE API routes
  // so permission checks, rate limiting, and audit logging are enforced.
  // Optimistic local state updates avoid re-fetching (which would lose cursor
  // position and discard pages already loaded via "Load more").
  // -------------------------------------------------------------------------

  // Allowed transitions mirror the PATCH route's ALLOWED_TRANSITIONS:
  //   draft → published | archived
  //   published → archived  (unpublish = archive, not draft)
  //   archived → draft      (restore to draft, then re-publish)
  const handleStatusChange = async (row: ArticleRow, nextStatus: 'published' | 'archived' | 'draft') => {
    setPublishingId(row.id);
    try {
      const res = await fetch(`/api/admin/articles/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({})) as { article?: ArticleRow; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Status change failed');
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: nextStatus as ArticleStatus, published_at: json.article?.published_at ?? r.published_at }
            : r
        )
      );
    } catch {
      setError('Status change failed');
    } finally {
      setPublishingId(null);
    }
  };

  const handleBrowseOnlyToggle = async (row: ArticleRow) => {
    setBrowseOnlyId(row.id);
    const next = !row.browse_only;
    try {
      const res = await fetch(`/api/admin/articles/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browse_only: next }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Update failed');
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, browse_only: next } : r))
      );
    } catch {
      setError('Update failed');
    } finally {
      setBrowseOnlyId(null);
    }
  };

  const handleDeleteClick = async (row: ArticleRow) => {
    setLoadingDeleteId(row.id);
    try {
      const [readsRes, commentsRes] = await Promise.all([
        supabase
          .from('reading_log')
          .select('id', { count: 'exact', head: true })
          .eq('article_id', row.id),
        supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('article_id', row.id),
      ]);
      setDeleteTarget({
        id: row.id,
        title: row.title ?? 'Untitled',
        readCount: readsRes.count ?? 0,
        commentCount: commentsRes.count ?? 0,
      });
    } catch {
      setDeleteTarget({ id: row.id, title: row.title ?? 'Untitled', readCount: 0, commentCount: 0 });
    } finally {
      setLoadingDeleteId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const res = await fetch(`/api/admin/articles/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      setError(json.error ?? 'Delete failed');
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: S[3],
          alignItems: 'center',
          padding: `${S[3]}px 0`,
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <FilterGroup label="Audience">
          {ALL_BANDS.map((b) => (
            <FilterChip
              key={b}
              active={audience.includes(b)}
              onClick={() => toggleAudience(b)}
            >
              {b === 'adult' ? 'Adult' : b === 'tweens' ? 'Tweens' : 'Kids'}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Status">
          {ALL_STATUSES.map((s) => (
            <FilterChip
              key={s}
              active={status.includes(s)}
              onClick={() => toggleStatus(s)}
            >
              {formatStatus(s).label}
            </FilterChip>
          ))}
        </FilterGroup>
        <div style={{ flex: 1, minWidth: 200 }}>
          <TextInput
            value={draftQ}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraftQ(e.target.value)}
            placeholder="Search title, body, tags…"
            aria-label="Search articles"
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: S[3], color: C.danger, fontSize: F.sm }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: S[6], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No articles match" description="Try widening the filters or clearing search." />
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: F.sm,
          }}
        >
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, borderBottom: `1px solid ${C.divider}` }}>
              <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 600 }}>Title</th>
              <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 600 }}>Audience</th>
              <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 600 }}>Status</th>
              <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 600, textAlign: 'right', width: 70 }}>Views</th>
              <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 600, width: 300 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                style={{ borderBottom: `1px solid ${C.divider}`, background: C.bg }}
              >
                {/* Title cell — title + badges + author/category metadata */}
                <td style={{ padding: `${S[2]}px ${S[3]}px` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: S[1], flexWrap: 'wrap' }}>
                    <Link
                      href={row.stories?.slug ? `/${row.stories.slug}` : '#'}
                      style={{
                        color: C.white,
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                      onClick={(e) => { if (!row.stories?.slug) e.preventDefault(); }}
                    >
                      {row.title || '—'}
                    </Link>
                    {row.is_breaking && <Badge variant="danger" size="xs">Breaking</Badge>}
                    {row.is_kids_safe && <Badge variant="info" size="xs">Kids</Badge>}
                    {row.browse_only && <Badge variant="warn" size="xs">Browse only</Badge>}
                  </div>
                  <div style={{ fontSize: F.xs, color: C.dim, marginTop: 2 }}>
                    {row.users?.username ? `@${row.users.username}` : '—'}
                    {row.categories?.name ? ` · ${row.categories.name}` : ''}
                  </div>
                </td>

                {/* Audience */}
                <td style={{ padding: `${S[2]}px ${S[3]}px`, color: C.dim }}>
                  {row.age_band === 'adult' ? 'Adult' : row.age_band === 'tweens' ? 'Tweens' : 'Kids'}
                </td>

                {/* Status */}
                <td style={{ padding: `${S[2]}px ${S[3]}px` }}>
                  <Badge variant={formatStatus(row.status).variant} size="xs">
                    {formatStatus(row.status).label}
                  </Badge>
                </td>

                {/* Views */}
                <td style={{ padding: `${S[2]}px ${S[3]}px`, color: C.dim, textAlign: 'right' }}>
                  {(row.view_count ?? 0).toLocaleString()}
                </td>

                {/* Actions */}
                <td
                  style={{ padding: `${S[2]}px ${S[3]}px` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        router.push(
                          row.is_kids_safe
                            ? `/admin/kids-story-manager?article=${row.id}`
                            : `/admin/story-manager?article=${row.id}`
                        )
                      }
                    >
                      Edit
                    </Button>

                    {row.status === 'draft' && (
                      <Button size="sm" variant="primary" disabled={publishingId === row.id} onClick={() => handleStatusChange(row, 'published')}>
                        {publishingId === row.id ? '…' : 'Publish'}
                      </Button>
                    )}
                    {row.status === 'published' && (
                      <Button size="sm" variant="ghost" disabled={publishingId === row.id} onClick={() => handleStatusChange(row, 'archived')}>
                        {publishingId === row.id ? '…' : 'Unpublish'}
                      </Button>
                    )}
                    {row.status === 'archived' && (
                      <Button size="sm" variant="ghost" disabled={publishingId === row.id} onClick={() => handleStatusChange(row, 'draft')}>
                        {publishingId === row.id ? '…' : 'Restore'}
                      </Button>
                    )}

                    {row.status === 'published' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={browseOnlyId === row.id}
                        onClick={() => handleBrowseOnlyToggle(row)}
                      >
                        {browseOnlyId === row.id
                          ? '…'
                          : row.browse_only
                          ? '+ Home'
                          : 'Browse only'}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loadingDeleteId === row.id}
                      onClick={() => handleDeleteClick(row)}
                      style={{ color: C.danger }}
                    >
                      {loadingDeleteId === row.id ? '…' : 'Delete'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cursor && !loading && (
        <div style={{ padding: S[3], display: 'flex', justifyContent: 'center' }}>
          <Button onClick={loadMore} disabled={loadingMore} variant="ghost" size="sm">
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      <DestructiveActionConfirm
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        message={
          deleteTarget
            ? `${deleteTarget.readCount} recorded read${deleteTarget.readCount !== 1 ? 's' : ''} · ${deleteTarget.commentCount} comment${deleteTarget.commentCount !== 1 ? 's' : ''}. Cannot be undone.`
            : ''
        }
        confirmText="delete"
        confirmLabel="Delete article"
        reasonRequired={false}
        action="article.delete"
        targetTable="articles"
        targetId={deleteTarget?.id ?? null}
        oldValue={deleteTarget?.title ?? null}
        newValue={null}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
      <span style={{ fontSize: F.xs, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'inline-flex', gap: 4 }}>{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `${S[1]}px ${S[2]}px`,
        border: `1px solid ${active ? C.border : C.divider}`,
        borderRadius: 999,
        background: active ? C.accent : C.bg,
        color: active ? C.bg : C.white,
        fontSize: F.xs,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
