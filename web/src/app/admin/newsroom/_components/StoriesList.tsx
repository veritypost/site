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
 *   ?cat=<uuid>           category filter
 *   ?subcat=<uuid>        subcategory filter
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/admin/Button';
import Select from '@/components/admin/Select';
import TextInput from '@/components/admin/TextInput';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { MODEL_OPTIONS } from '@/lib/newsroomModels';
import { createClient } from '@/lib/supabase/client';

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
  category_name?: string | null;
  subcategory_name?: string | null;
  ai_suggested_headline?: string | null;
  ai_suggested_slug?: string | null;
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

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

type SourceItem = {
  id: string;
  url: string;
  title: string | null;
  outlet: string | null;
};

type DetailResponse = {
  observations: SourceItem[];
};

type StorySearchResult = {
  id: string;
  title: string;
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

type BandGenState = 'idle' | 'generating' | 'generated' | 'failed';

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffS = Math.floor(diffMs / 1000);
    if (diffS < 60) return 'just now';
    const diffM = Math.floor(diffS / 60);
    if (diffM < 60) return `${diffM}m ago`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    const diffW = Math.floor(diffD / 7);
    if (diffD < 60) return `${diffW}w ago`;
    const diffMo = Math.floor(diffD / 30);
    return `${diffMo}mo ago`;
  } catch {
    return '—';
  }
}

function bandDisplayLabel(band: Band): string {
  if (band === 'adult') return 'Adults';
  if (band === 'tweens') return 'Tweens';
  return 'Kids';
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
  const cat = sp.get('cat') ?? '';
  const subcat = sp.get('subcat') ?? '';

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
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data } = await supabase
          .from('categories')
          .select('id, name, parent_id')
          .is('deleted_at', null)
          .order('name');
        if (cancelled) return;
        setCategories((data as CategoryRow[] | null) ?? []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (cat) params.set('category_id', cat);
      if (subcat) params.set('subcategory_id', subcat);
      return params.toString();
    },
    [rq, gsRaw, dateFrom, dateTo, job, dq, cat, subcat],
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

  const queryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const sq of savedQueries) {
      map.set(sq.id, sq.name?.trim() || sq.query_text.slice(0, 60));
    }
    return map;
  }, [savedQueries]);

  const topCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  const subcategories = useMemo(
    () => (cat ? categories.filter((c) => c.parent_id === cat) : []),
    [categories, cat],
  );

  return (
    <div>
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
        <Select
          value={cat}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            const next = e.target.value || null;
            const params = new URLSearchParams(sp.toString());
            if (next) params.set('cat', next);
            else params.delete('cat');
            params.delete('subcat');
            const qs = params.toString();
            router.replace(qs ? `?${qs}` : '?', { scroll: false });
          }}
          block={false}
          style={{ minWidth: 150, minHeight: 40 }}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {topCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {cat && subcategories.length > 0 && (
          <Select
            value={subcat}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setParam('subcat', e.target.value || null)
            }
            block={false}
            style={{ minWidth: 150, minHeight: 40 }}
            aria-label="Subcategory"
          >
            <option value="">All subcategories</option>
            {subcategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {stories.map((s) => (
              <StoryCard
                key={s.id}
                story={s}
                selectedModelIdx={selectedModelIdx}
                onMutated={() => void reload()}
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
    </div>
  );
}

function MovePicker({
  observationId,
  sourceStoryId,
  onMoved,
  onClose,
}: {
  observationId: string;
  sourceStoryId: string;
  onMoved: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StorySearchResult[]>([]);
  const [moving, setMoving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: '10' });
      fetch(`/api/admin/newsroom/research/stories?${params.toString()}`)
        .then((res) => res.json())
        .then((json: { stories?: StorySearchResult[] }) => {
          setResults(
            (json.stories ?? []).filter((s) => s.id !== sourceStoryId),
          );
        })
        .catch(() => {});
    }, 300);
    return () => {
      if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);
    };
  }, [query, sourceStoryId]);

  async function handleSelect(targetId: string) {
    if (moving) return;
    setMoving(true);
    try {
      const res = await fetch(
        `/api/admin/newsroom/research/stories/${sourceStoryId}/move-observation`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ observation_id: observationId, target_story_id: targetId }),
        },
      );
      if (res.ok) {
        onMoved();
      }
    } catch {
      // ignore
    } finally {
      setMoving(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 4,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        background: C.bg,
        padding: S[2],
        width: 280,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[1], marginBottom: S[1] }}>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stories…"
          style={{
            flex: 1,
            fontSize: F.xs,
            padding: '4px 6px',
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            background: C.bg,
            color: C.ink,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.muted,
            fontSize: F.sm,
            lineHeight: 1,
            padding: '2px 4px',
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => void handleSelect(r.id)}
              disabled={moving}
              style={{
                background: 'none',
                border: 'none',
                cursor: moving ? 'default' : 'pointer',
                textAlign: 'left',
                fontSize: F.xs,
                color: C.ink,
                padding: '4px 6px',
                borderRadius: 4,
                width: '100%',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.card;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StoryCard({
  story,
  selectedModelIdx,
  onMutated,
}: {
  story: StoryRow;
  selectedModelIdx: number;
  onMutated: () => void;
}) {
  const headline = story.ai_suggested_headline ?? story.title;
  const slug = story.ai_suggested_slug ?? story.slug;

  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/admin/newsroom/research/stories/${story.id}`)
      .then((res) => res.json())
      .then((json: DetailResponse) => {
        setSources(json.observations ?? []);
      })
      .catch(() => {
        setSources(null);
      })
      .finally(() => {
        setSourcesLoading(false);
      });
  }, [story.id]);

  const initialBandStates = useMemo((): Record<Band, BandGenState> => {
    const result = {} as Record<Band, BandGenState>;
    for (const a of story.articles) {
      if (a.state === 'pending') {
        result[a.band] = 'idle';
      } else {
        result[a.band] = 'generated';
      }
    }
    const allBands: Band[] = ['adult', 'tweens', 'kids'];
    for (const b of allBands) {
      if (!(b in result)) result[b] = 'idle';
    }
    return result;
  }, [story.articles]);

  const [bandStates, setBandStates] = useState<Record<Band, BandGenState>>(initialBandStates);
  const [bandRunIds, setBandRunIds] = useState<Partial<Record<Band, string>>>({});
  const pollTimers = useRef<Partial<Record<Band, ReturnType<typeof setInterval>>>>({});

  useEffect(() => {
    return () => {
      for (const timer of Object.values(pollTimers.current)) {
        if (timer !== undefined) clearInterval(timer);
      }
    };
  }, []);

  function articleIdForBand(band: Band): string | null {
    return story.articles.find((a) => a.band === band)?.article_id ?? null;
  }

  async function handleGenerate(band: Band) {
    if (bandStates[band] === 'generating') return;
    setBandStates((prev) => ({ ...prev, [band]: 'generating' }));

    try {
      const { provider, model } = MODEL_OPTIONS[selectedModelIdx] ?? MODEL_OPTIONS[0];
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          story_id: story.id,
          age_band: band,
          provider,
          model,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { run_id?: string; error?: string };
      if (!res.ok || !json.run_id) {
        setBandStates((prev) => ({ ...prev, [band]: 'failed' }));
        return;
      }
      const runId = json.run_id;
      setBandRunIds((prev) => ({ ...prev, [band]: runId }));
      startPolling(band, runId);
    } catch {
      setBandStates((prev) => ({ ...prev, [band]: 'failed' }));
    }
  }

  function startPolling(band: Band, runId: string) {
    if (pollTimers.current[band] !== undefined) {
      clearInterval(pollTimers.current[band]);
    }
    const timer = setInterval(() => {
      void pollRun(band, runId);
    }, 2000);
    pollTimers.current[band] = timer;
  }

  async function pollRun(band: Band, runId: string) {
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}`);
      if (!res.ok) return;
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      const status = json.status;
      if (status === 'completed' || status === 'done' || status === 'success') {
        if (pollTimers.current[band] !== undefined) {
          clearInterval(pollTimers.current[band]);
          delete pollTimers.current[band];
        }
        setBandStates((prev) => ({ ...prev, [band]: 'generated' }));
        setBandRunIds((prev) => {
          const next = { ...prev };
          delete next[band];
          return next;
        });
        onMutated();
      } else if (status === 'failed' || status === 'error') {
        if (pollTimers.current[band] !== undefined) {
          clearInterval(pollTimers.current[band]);
          delete pollTimers.current[band];
        }
        setBandStates((prev) => ({ ...prev, [band]: 'failed' }));
        setBandRunIds((prev) => {
          const next = { ...prev };
          delete next[band];
          return next;
        });
      }
    } catch {
      // silently ignore transient poll errors
    }
  }

  const allBands: Band[] = ['adult', 'tweens', 'kids'];

  return (
    <article
      style={{
        border: `1px solid ${C.divider}`,
        borderRadius: 10,
        background: C.bg,
        overflow: 'hidden',
      }}
    >
      {/* Header section */}
      <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
        {/* Top row: headline + timestamp */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: S[3],
            marginBottom: S[2],
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: F.md,
              fontWeight: 600,
              color: C.ink,
              lineHeight: 1.35,
              flex: 1,
              minWidth: 0,
            }}
          >
            {headline}
          </h3>
          <span
            style={{
              fontSize: F.xs,
              color: C.muted,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {fmtRelative(story.last_observed_at)}
          </span>
        </div>

        {/* Category, subcategory, slug + band buttons row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: S[3],
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {story.category_name && (
              <span style={{ fontSize: F.xs, color: C.muted }}>{story.category_name}</span>
            )}
            {story.subcategory_name && (
              <span style={{ fontSize: F.xs, color: C.muted }}>{story.subcategory_name}</span>
            )}
            <span
              style={{
                fontSize: F.xs,
                color: C.muted,
                fontFamily: 'monospace',
              }}
            >
              {slug}
            </span>
          </div>

          {/* Band generate buttons */}
          <div style={{ display: 'flex', gap: S[1], flexShrink: 0, flexWrap: 'wrap' }}>
            {allBands.map((band) => {
              const state = bandStates[band];
              const articleId = articleIdForBand(band);
              const label = bandDisplayLabel(band);

              if (state === 'generating') {
                return (
                  <Button key={band} variant="secondary" size="sm" disabled>
                    Generating…
                  </Button>
                );
              }

              if (state === 'generated' && articleId) {
                return (
                  <a
                    key={band}
                    href={`/admin/story-manager?article=${articleId}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: F.xs,
                      color: C.muted,
                      padding: `4px ${S[2]}px`,
                      border: `1px solid ${C.divider}`,
                      borderRadius: 6,
                      textDecoration: 'none',
                      gap: 4,
                    }}
                  >
                    ✓ {label}
                  </a>
                );
              }

              if (state === 'generated' && !articleId) {
                return (
                  <Button
                    key={band}
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleGenerate(band)}
                  >
                    {label}
                  </Button>
                );
              }

              if (state === 'failed') {
                return (
                  <Button
                    key={band}
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleGenerate(band)}
                    style={{ color: C.danger, borderColor: C.danger } as React.CSSProperties}
                  >
                    Retry
                  </Button>
                );
              }

              return (
                <Button
                  key={band}
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleGenerate(band)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sources section */}
      <div
        style={{
          borderTop: `1px solid ${C.divider}`,
          padding: `${S[2]}px ${S[4]}px`,
        }}
      >
        {sourcesLoading ? (
          <span style={{ fontSize: F.xs, color: C.muted }}>Loading sources…</span>
        ) : sources && sources.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            {sources.map((src) => (
              <div key={src.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
                  <span style={{ fontSize: F.sm, color: C.ink, flex: 1, minWidth: 0 }}>
                    {src.outlet && (
                      <span style={{ color: C.muted, marginRight: 4 }}>{src.outlet} —</span>
                    )}
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: C.accent, textDecoration: 'none' }}
                    >
                      {src.title ?? src.url}
                    </a>
                  </span>
                  <button
                    onClick={() =>
                      setOpenPickerId((prev) => (prev === src.id ? null : src.id))
                    }
                    style={{
                      background: 'none',
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: F.xs,
                      color: C.muted,
                      padding: '2px 6px',
                      flexShrink: 0,
                    }}
                  >
                    Move
                  </button>
                </div>
                {openPickerId === src.id && (
                  <MovePicker
                    observationId={src.id}
                    sourceStoryId={story.id}
                    onMoved={() => {
                      setSources((prev) => prev?.filter((s) => s.id !== src.id) ?? null);
                      setOpenPickerId(null);
                    }}
                    onClose={() => setOpenPickerId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
