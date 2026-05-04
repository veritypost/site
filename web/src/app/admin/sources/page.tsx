'use client';

/**
 * Wave 6 — Stream F provenance UI
 *
 * /admin/sources
 *
 * Standalone page for the no-delete provenance log. NOT a tab on
 * /admin/feeds — surface separation: feeds page manages the live
 * feed list; sources page is the historical receipts log.
 *
 * Reads GET /api/admin/sources with keyset pagination.
 * Three controls: outlet ilike, first-cited date_from, first-cited
 * date_to. Plus Export CSV (current filter).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Page, { PageHeader } from '@/components/admin/Page';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import Badge from '@/components/admin/Badge';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

type SourceItem = {
  id: string;
  article_id: string;
  url_snapshot: string;
  title_snapshot: string | null;
  outlet_snapshot: string;
  source_class: string | null;
  fetched_at: string;
  created_at: string;
  feed_id: string | null;
  article_title: string | null;
  article_status: string | null;
  article_age_band: string | null;
  article_deleted: boolean;
};

type ListResponse = {
  sources: SourceItem[];
  cursor: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function sourceClassLabel(sc: string | null): string {
  switch (sc) {
    case 'rss':
      return 'RSS';
    case 'scrape_html':
      return 'Scrape HTML';
    case 'scrape_json':
      return 'Scrape JSON';
    case 'search_api':
      return 'Search API';
    case null:
    case undefined:
    case '':
      return '—';
    default:
      return sc;
  }
}

// Editor surface differs per band (kids articles live in their own
// dashboard). Fall back to story-manager when band is unknown — the
// editor accepts adult/tweens articles via that route.
function articleHref(ageBand: string | null, id: string): string {
  if (ageBand === 'kids') return `/admin/kids-story-manager?article=${id}`;
  return `/admin/story-manager?article=${id}`;
}

export default function SourcesAdminPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const outlet = sp.get('outlet') ?? '';
  const dateFrom = sp.get('from') ?? '';
  const dateTo = sp.get('to') ?? '';

  const [outletInput, setOutletInput] = useState(outlet);
  // Keep the input in sync with the URL when it changes from outside
  // (e.g. browser back/forward).
  useEffect(() => {
    setOutletInput(outlet);
  }, [outlet]);

  // Debounce the outlet text search → URL update.
  useEffect(() => {
    if (outletInput === outlet) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (outletInput) params.set('outlet', outletInput);
      else params.delete('outlet');
      router.replace(`?${params.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(handle);
  }, [outletInput, outlet, sp, router]);

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}): string => {
      const params = new URLSearchParams({ limit: '50', ...extra });
      if (outlet) params.set('outlet', outlet);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return params.toString();
    },
    [outlet, dateFrom, dateTo],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sources?${buildQuery()}`);
      const json = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        setSources([]);
        setCursor(null);
        return;
      }
      setSources(json.sources ?? []);
      setCursor(json.cursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sources?${buildQuery({ cursor })}`);
      const json = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        return;
      }
      setSources((prev) => [...prev, ...(json.sources ?? [])]);
      setCursor(json.cursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoadingMore(false);
    }
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }

  const exportHref = `/api/admin/sources/export.csv?${buildQuery()}`;

  return (
    <Page>
      <PageHeader
        title="Sources"
        subtitle="Every URL Verity Post has cited. No-delete provenance log."
      />

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
          value={outletInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOutletInput(e.target.value)}
          placeholder="Search outlet (e.g. CNN, BBC)"
          style={{ flex: '1 1 220px', minWidth: 180, minHeight: 40, padding: '0 10px' } as React.CSSProperties}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setParam('from', e.target.value || null)}
          aria-label="First cited from"
          style={{
            minHeight: 40,
            padding: '0 8px',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: F.sm,
            color: C.ink,
            background: C.bg,
            fontFamily: 'inherit',
          }}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setParam('to', e.target.value || null)}
          aria-label="First cited to"
          style={{
            minHeight: 40,
            padding: '0 8px',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: F.sm,
            color: C.ink,
            background: C.bg,
            fontFamily: 'inherit',
          }}
        />
        <a
          href={exportHref}
          // Plain anchor (not Next Link) so the browser performs an actual
          // navigation that triggers the Content-Disposition download.
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 40,
            padding: '0 14px',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: F.sm,
            color: C.ink,
            background: C.bg,
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = C.bg;
          }}
        >
          Export CSV
        </a>
      </div>

      {error && (
        <div style={{ padding: S[3], color: C.danger, fontSize: F.sm, marginBottom: S[2] }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: S[8], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          title="No sources cited yet"
          description="Once articles get published with URL citations, every URL lands here permanently — even if the article is later edited to remove it."
        />
      ) : (
        <>
          <div
            style={{
              border: `1px solid ${C.divider}`,
              borderRadius: 8,
              overflow: 'hidden',
              background: C.bg,
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  fontSize: F.base,
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr>
                    {(['First cited', 'Outlet', 'URL', 'Article', 'Class'] as const).map((h) => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          textAlign: 'left',
                          padding: `${S[2]}px ${S[3]}px`,
                          background: C.card,
                          borderBottom: `1px solid ${C.divider}`,
                          fontSize: F.xs,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: C.soft,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((row) => (
                    <SourceRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {cursor && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: S[4] }}>
              <Button onClick={loadMore} variant="secondary" size="sm" disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function SourceRow({ row }: { row: SourceItem }) {
  const articleLabel = row.article_title ?? '(untitled article)';
  const articleHrefStr = articleHref(row.article_age_band, row.article_id);
  return (
    <tr>
      <td style={cellStyle()}>
        <span style={{ whiteSpace: 'nowrap', color: C.ink }}>{fmtDate(row.created_at)}</span>
      </td>
      <td style={cellStyle()}>
        <span style={{ color: C.ink }}>{row.outlet_snapshot}</span>
      </td>
      <td style={cellStyle()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <a
            href={row.url_snapshot}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: C.accent,
              textDecoration: 'none',
              fontSize: F.sm,
              wordBreak: 'break-all',
              maxWidth: 420,
            }}
          >
            {row.url_snapshot}
          </a>
          {row.title_snapshot && (
            <span
              style={{
                color: C.dim,
                fontSize: F.xs,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 420,
              }}
              title={row.title_snapshot}
            >
              {row.title_snapshot}
            </span>
          )}
        </div>
      </td>
      <td style={cellStyle()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link
            href={articleHrefStr}
            style={{
              color: C.accent,
              textDecoration: 'none',
              fontSize: F.sm,
              maxWidth: 320,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={articleLabel}
          >
            {articleLabel}
          </Link>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {row.article_status === 'published' ? (
              <Badge variant="success" size="xs">Published</Badge>
            ) : row.article_status === 'archived' ? (
              <Badge variant="danger" size="xs">Archived</Badge>
            ) : row.article_status ? (
              <Badge variant="warn" size="xs">{row.article_status}</Badge>
            ) : null}
            {row.article_deleted && <Badge variant="danger" size="xs">Deleted</Badge>}
          </div>
        </div>
      </td>
      <td style={cellStyle()}>
        <span style={{ fontSize: F.sm, color: C.dim }}>{sourceClassLabel(row.source_class)}</span>
      </td>
    </tr>
  );
}

function cellStyle(): React.CSSProperties {
  return {
    padding: `${S[2]}px ${S[3]}px`,
    borderBottom: `1px solid ${C.divider}`,
    color: C.ink,
    verticalAlign: 'top',
  };
}
