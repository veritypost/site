'use client';

/**
 * Wave 5 — Stream E Stories list rebuild
 *
 * Replaces the legacy feed_clusters list at /admin/newsroom Discovery tab.
 * Reads /api/admin/newsroom/research/stories with keyset pagination.
 *
 * URL state:
 *   ?rq=<uuid>            research_query filter (saved query)
 *   ?gs=<csv>             generation_state filter (multi)
 *   ?from=<ISO> ?to=<ISO> first_seen date range
 *   ?job=<uuid>           scope to a single research_jobs.id (banner shown)
 *   ?dq=<text>            free-text title/slug search
 *   ?story=<uuid>         opens StoryDetailDrawer for that id
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/admin/Button';
import Select from '@/components/admin/Select';
import TextInput from '@/components/admin/TextInput';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import Badge from '@/components/admin/Badge';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import StoryDetailDrawer from './StoryDetailDrawer';

type Band = 'adult' | 'tweens' | 'kids';

type StoryArticleRollup = {
  band: Band;
  state: 'pending' | 'published' | 'draft' | 'archived';
  article_id: string | null;
  title: string | null;
};

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  keywords: string[];
  first_seen_at: string | null;
  last_observed_at: string | null;
  generation_state: string | null;
  research_query_id: string | null;
  is_locked: boolean;
  observation_count: number;
  source_count: number;
  articles: StoryArticleRollup[];
};

type ListResponse = {
  stories: StoryRow[];
  cursor: string | null;
};

type SavedQuery = {
  id: string;
  name: string | null;
  query_text: string;
};

const STATE_FILTERS = [
  { value: 'forming', label: 'Forming' },
  { value: 'clustered', label: 'Clustered' },
  { value: 'ready', label: 'Ready' },
  { value: 'generating', label: 'Generating' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
] as const;

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

function bandLabel(band: Band): string {
  if (band === 'adult') return 'Adult';
  if (band === 'tweens') return 'Tweens';
  return 'Kids';
}

function bandBadgeVariant(state: StoryArticleRollup['state']): 'success' | 'warn' | 'neutral' | 'danger' {
  switch (state) {
    case 'published':
      return 'success';
    case 'draft':
      return 'warn';
    case 'archived':
      return 'danger';
    default:
      return 'neutral';
  }
}

function generationBadgeVariant(state: string | null): 'success' | 'warn' | 'neutral' | 'danger' | 'info' {
  switch (state) {
    case 'published':
      return 'success';
    case 'generating':
    case 'ready':
      return 'info';
    case 'forming':
    case 'clustered':
      return 'warn';
    case 'rejected':
    case 'archived':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default function StoriesList({ selectedModelIdx = 0 }: { selectedModelIdx?: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  const rq = sp.get('rq') ?? '';
  const gsRaw = sp.get('gs') ?? '';
  const dateFrom = sp.get('from') ?? '';
  const dateTo = sp.get('to') ?? '';
  const job = sp.get('job') ?? '';
  const dq = sp.get('dq') ?? '';
  const openStoryId = sp.get('story') ?? '';

  const [dqInput, setDqInput] = useState(dq);
  useEffect(() => {
    if (dqInput === dq) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (dqInput) params.set('dq', dqInput);
      else params.delete('dq');
      router.replace(`?${params.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(handle);
  }, [dqInput, dq, sp, router]);

  const [stories, setStories] = useState<StoryRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  // Load saved queries for the dropdown
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/newsroom/research/queries')
      .then((res) => res.json())
      .then((json: { queries?: SavedQuery[] }) => {
        if (cancelled) return;
        setSavedQueries(json.queries ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}): string => {
      const params = new URLSearchParams({ limit: '50', ...extra });
      if (rq) params.set('research_query_id', rq);
      if (gsRaw) params.set('generation_state', gsRaw);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (job) params.set('job', job);
      if (dq) params.set('q', dq);
      return params.toString();
    },
    [rq, gsRaw, dateFrom, dateTo, job, dq],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/newsroom/research/stories?${buildQuery()}`);
      const json = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        setStories([]);
        setCursor(null);
        return;
      }
      setStories(json.stories ?? []);
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
      const res = await fetch(
        `/api/admin/newsroom/research/stories?${buildQuery({ cursor })}`,
      );
      const json = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        return;
      }
      setStories((prev) => [...prev, ...(json.stories ?? [])]);
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

  function clearJobFilter() {
    setParam('job', null);
  }

  function openStory(id: string) {
    setParam('story', id);
  }

  function closeStory() {
    setParam('story', null);
  }

  const queryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const sq of savedQueries) {
      map.set(sq.id, sq.name?.trim() || sq.query_text.slice(0, 60));
    }
    return map;
  }, [savedQueries]);

  return (
    <div>
      {/* Job-scope banner */}
      {job && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S[2],
            padding: `${S[2]}px ${S[3]}px`,
            marginBottom: S[3],
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: F.sm,
            color: C.ink,
          }}
        >
          <span>Showing stories from this run.</span>
          <Button variant="ghost" size="sm" onClick={clearJobFilter}>
            Clear
          </Button>
        </div>
      )}

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
          placeholder="Search story titles or slugs"
          style={{ flex: '1 1 200px', minWidth: 160, minHeight: 40, padding: '0 10px' } as React.CSSProperties}
        />
        <Select
          value={rq}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('rq', e.target.value || null)}
          block={false}
          style={{ minWidth: 160, minHeight: 40 }}
          aria-label="Research query"
        >
          <option value="">All queries</option>
          {savedQueries.map((sq) => (
            <option key={sq.id} value={sq.id}>
              {sq.name?.trim() || sq.query_text.slice(0, 50)}
            </option>
          ))}
        </Select>
        <Select
          value={gsRaw}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('gs', e.target.value || null)}
          block={false}
          style={{ minWidth: 140, minHeight: 40 }}
          aria-label="Generation state"
        >
          <option value="">All states</option>
          {STATE_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setParam('from', e.target.value || null)}
          aria-label="First-seen from"
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
          aria-label="First-seen to"
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
      </div>

      {error && <div style={{ padding: S[3], color: C.danger, fontSize: F.sm }}>{error}</div>}

      {loading ? (
        <div style={{ padding: S[8], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : stories.length === 0 ? (
        <EmptyState
          title="No stories"
          description={
            job
              ? 'This run produced no stories. Promote items from the result screen, or clear the run filter to see all stories.'
              : 'Run Feed to ingest items. Stories form when matching clusters are created or extended.'
          }
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {stories.map((s) => (
              <StoryRowItem
                key={s.id}
                story={s}
                queryName={s.research_query_id ? queryNameById.get(s.research_query_id) ?? null : null}
                onOpen={() => openStory(s.id)}
              />
            ))}
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

      {openStoryId && (
        <StoryDetailDrawer
          storyId={openStoryId}
          selectedModelIdx={selectedModelIdx}
          onClose={closeStory}
          onMutated={() => {
            void reload();
          }}
        />
      )}
    </div>
  );
}

function StoryRowItem({
  story,
  queryName,
  onOpen,
}: {
  story: StoryRow;
  queryName: string | null;
  onOpen: () => void;
}) {
  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[2],
        padding: `${S[3]}px ${S[4]}px`,
        border: `1px solid ${C.divider}`,
        borderRadius: 10,
        background: C.bg,
        cursor: 'pointer',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = C.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.divider;
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: S[3] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: F.md, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
            {story.title}
          </h3>
          <div style={{ marginTop: S[1], fontSize: F.xs, color: C.dim }}>
            {queryName ? <span>Query: {queryName} · </span> : null}
            <span>First seen {fmtDate(story.first_seen_at)}</span>
            {story.last_observed_at && story.last_observed_at !== story.first_seen_at && (
              <span> · Last observed {fmtDate(story.last_observed_at)}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexShrink: 0 }}>
          {story.is_locked && (
            <Badge variant="warn" size="xs">
              Locked
            </Badge>
          )}
          {/* Only render the lifecycle badge when it's an explicit end-state
              the operator set (rejected / archived) or a publish marker.
              Internal states (forming / clustered / ready / generating)
              are not surfaced — the card existing IS the "ready to
              generate" signal. */}
          {(story.generation_state === 'rejected' ||
            story.generation_state === 'archived' ||
            story.generation_state === 'published') && (
            <Badge variant={generationBadgeVariant(story.generation_state)} size="xs">
              {story.generation_state}
            </Badge>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: S[4], alignItems: 'center', flexWrap: 'wrap', fontSize: F.xs, color: C.muted }}>
        <span>
          {story.source_count} {story.source_count === 1 ? 'source' : 'sources'}
        </span>
        <span>
          {story.observation_count} {story.observation_count === 1 ? 'observation' : 'observations'}
        </span>
        <div style={{ display: 'flex', gap: S[1], marginLeft: 'auto' }}>
          {story.articles.map((a) => {
            // pending = no article exists for this band yet → render
            // a plain "Generate" affordance (clicking the row opens the
            // drawer where the actual button lives). Only show a badge
            // when there's a real article state to convey.
            if (a.state === 'pending') {
              return (
                <Badge key={a.band} variant="neutral" size="xs">
                  {bandLabel(a.band)}: Generate
                </Badge>
              );
            }
            return (
              <Badge key={a.band} variant={bandBadgeVariant(a.state)} size="xs">
                {bandLabel(a.band)}: {a.state}
              </Badge>
            );
          })}
        </div>
      </div>
    </article>
  );
}
