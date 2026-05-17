'use client';

import { useEffect, useMemo, useState, CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePageViewTrack } from '@/lib/useTrack';
import { formatDate } from '@/lib/dates';

// TODO-SEARCH Session C — unified /search surface.
// Implements the locked spec: kicker + H1 + sub + search bar + quick
// chips, 3-col grid (220px filters / flex results / 300px rail) on
// desktop, "Filters" bottom sheet on tablet/mobile, mixed Story +
// Article results from /api/search with the new `results[]` contract.
//
// All filter state lives in the URL so links + back-button work.

type ResultType = 'all' | 'stories' | 'articles';
type Chip = 'all' | 'today' | 'this_week' | 'developing' | 'updated_recently';
type Status = '' | 'developing' | 'updated';
type Sort =
  | 'recent'
  | 'newest_article'
  | 'most_sourced'
  | 'just_broke'
  | 'resurfacing'
  | 'long_arcs';

interface StoryRow {
  type: 'story';
  id: string;
  slug: string | null;
  title: string | null;
  lifecycle_status: 'developing' | 'resolved' | null;
  published_at: string | null;
  last_observed_at: string | null;
  article_count: number;
  latest_article_at: string | null;
  has_recent_comments: boolean;
  comment_count?: number;
  topic: { id: string | null; slug?: string | null; name?: string | null } | null;
}

interface ArticleRow {
  type: 'article';
  id: string;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  story: { slug: string | null; title?: string | null } | null;
  category: { id: string | null; name: string | null } | null;
}

type ResultRow = StoryRow | ArticleRow;

interface SearchResponse {
  results?: ResultRow[];
  facets?: {
    content_type: { story: number; article: number };
    topic: Record<string, number>;
    status: { developing: number; updated: number };
    date: { today: number; this_week: number; this_month: number; this_year: number };
  };
  ignored_filters?: string[];
}

const CHIPS: { id: Chip; label: string }[] = [
  { id: 'all', label: 'All results' },
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'developing', label: 'Developing' },
  { id: 'updated_recently', label: 'Updated recently' },
];

const SORT_OPTIONS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recently updated' },
  { id: 'just_broke', label: 'Just broke' },
  { id: 'newest_article', label: 'Newest article' },
  { id: 'resurfacing', label: 'Resurfacing' },
  { id: 'long_arcs', label: 'Long arcs' },
  { id: 'most_sourced', label: 'Most sourced' },
];

const DATE_OPTIONS: { id: '' | 'today' | 'this_week' | 'this_month' | 'this_year'; label: string }[] = [
  { id: '', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'this_year', label: 'This year' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOptionToFrom(opt: string): string | null {
  const now = Date.now();
  switch (opt) {
    case 'today':
      return new Date(now - DAY_MS).toISOString();
    case 'this_week':
      return new Date(now - 7 * DAY_MS).toISOString();
    case 'this_month':
      return new Date(now - 30 * DAY_MS).toISOString();
    case 'this_year':
      return new Date(now - 365 * DAY_MS).toISOString();
    default:
      return null;
  }
}

type Topic = { slug: string; label: string };

export default function UnifiedSearch({
  initialTopic,
  topics,
}: { initialTopic?: string; topics?: Topic[] } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  usePageViewTrack(
    pathname && pathname.startsWith('/category') ? 'category' : 'search',
  );
  const sp = useSearchParams();
  const topicList: Topic[] = topics ?? [];

  const [q, setQ] = useState<string>(sp.get('q') || '');
  const [type, setType] = useState<ResultType>((sp.get('type') as ResultType) || 'all');
  const [topic, setTopic] = useState<string>(sp.get('topic') || initialTopic || '');
  const [status, setStatus] = useState<Status>((sp.get('status') as Status) || '');
  const [chip, setChip] = useState<Chip>((sp.get('chip') as Chip) || 'all');
  const [sort, setSort] = useState<Sort>(() => {
    const raw = sp.get('sort');
    if (
      raw === 'recent' ||
      raw === 'newest_article' ||
      raw === 'most_sourced' ||
      raw === 'just_broke' ||
      raw === 'resurfacing' ||
      raw === 'long_arcs'
    ) {
      return raw;
    }
    return 'recent';
  });
  const [dateOpt, setDateOpt] = useState<string>(sp.get('date') || '');

  const [results, setResults] = useState<ResultRow[]>([]);
  const [facets, setFacets] = useState<SearchResponse['facets'] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);

  // Build URL params for both the fetch and the address bar.
  const apiParams = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    p.set('type', type);
    if (topic) p.set('topic', topic);
    if (status) p.set('status', status);
    if (chip !== 'all') p.set('chip', chip);
    if (sort !== 'recent') p.set('sort', sort);
    const from = dateOptionToFrom(dateOpt);
    if (from) p.set('from', from);
    return p;
  }, [q, type, topic, status, chip, sort, dateOpt]);

  // Push state to URL whenever filters change. Path is taken from the
  // current pathname so this works at /search and /category/<slug>
  // alike; if a topic was pinned via prop (e.g. on /category/<slug>),
  // omit it from the query string so the URL stays clean.
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (type !== 'all') p.set('type', type);
    if (topic && topic !== initialTopic) p.set('topic', topic);
    if (status) p.set('status', status);
    if (chip !== 'all') p.set('chip', chip);
    if (sort !== 'recent') p.set('sort', sort);
    if (dateOpt) p.set('date', dateOpt);
    const qs = p.toString();
    router.replace((pathname || '/search') + (qs ? `?${qs}` : ''), {
      scroll: false,
    });
  }, [q, type, topic, status, chip, sort, dateOpt, router, pathname, initialTopic]);

  // Fetch on filter change.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/search?${apiParams.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: SearchResponse) => {
        setResults(d.results || []);
        setFacets(d.facets || null);
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') {
          setResults([]);
          setFacets(null);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiParams]);

  const activeFiltersCount =
    (topic ? 1 : 0) + (status ? 1 : 0) + (dateOpt ? 1 : 0);

  return (
    <div className="vp-search-shell">
      <style>{styles}</style>

      {/* Page-head zone */}
      <div className="vp-search-head">
        <div className="vp-search-kicker">Browse Verity Post</div>
        <h1 className="vp-search-h1">Find a story or article</h1>
        <p className="vp-search-sub">
          Search across active stories and the articles inside them. Filters
          narrow by topic, date, or status.
        </p>

        <form
          role="search"
          className="vp-search-bar-row"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <input
            className="vp-search-input"
            type="search"
            value={q}
            placeholder="Search by keyword"
            aria-label="Search"
            onChange={(e) => setQ(e.target.value)}
          />
        </form>

        <div className="vp-search-chips" role="tablist" aria-label="Quick filters">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={chip === c.id}
              className={`vp-chip${chip === c.id ? ' vp-chip-on' : ''}`}
              onClick={() => setChip(c.id)}
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            className={`vp-chip vp-chip-filters${activeFiltersCount ? ' vp-chip-on' : ''}`}
            onClick={() => setSheetOpen(true)}
            aria-label="Open filters"
          >
            Filters{activeFiltersCount ? ` (${activeFiltersCount})` : ''}
          </button>
        </div>
      </div>

      {/* Content-type tabs (mobile + tablet show this row; desktop hides via CSS in favor of the left rail). */}
      <div className="vp-search-typetabs" role="tablist" aria-label="Result type">
        {(['all', 'stories', 'articles'] as ResultType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            className={`vp-typetab${type === t ? ' vp-typetab-on' : ''}`}
            onClick={() => setType(t)}
          >
            {t === 'all' ? 'All' : t === 'stories' ? 'Stories' : 'Articles'}
            {facets ? (
              <span className="vp-typetab-count">
                {t === 'all'
                  ? facets.content_type.story + facets.content_type.article
                  : t === 'stories'
                  ? facets.content_type.story
                  : facets.content_type.article}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 3-col grid: filters / results / rail */}
      <div className="vp-search-grid">
        {/* Left filter rail (desktop only) */}
        <aside className="vp-search-filters" aria-label="Filters">
          <FilterGroup
            label="Content type"
            options={[
              { id: 'all', label: 'All' },
              { id: 'stories', label: 'Stories' },
              { id: 'articles', label: 'Articles' },
            ]}
            value={type}
            onChange={(v) => setType(v as ResultType)}
          />
          <FilterGroup
            label="Topic"
            options={[
              { id: '', label: 'All topics' },
              ...topicList.map((t) => ({ id: t.slug, label: t.label })),
            ]}
            value={topic}
            onChange={setTopic}
          />
          <FilterGroup
            label="Date"
            options={DATE_OPTIONS.map((d) => ({ id: d.id, label: d.label }))}
            value={dateOpt}
            onChange={setDateOpt}
          />
          <FilterGroup
            label="Status"
            options={[
              { id: '', label: 'Any' },
              { id: 'developing', label: 'Developing' },
              { id: 'updated', label: 'Updated' },
            ]}
            value={status}
            onChange={(v) => setStatus(v as Status)}
          />
        </aside>

        {/* Center results */}
        <main className="vp-search-results">
          <div className="vp-search-sortrow">
            <span className="vp-search-resultcount" aria-live="polite">
              {loading
                ? 'Searching…'
                : `${results.length} result${results.length === 1 ? '' : 's'}`}
            </span>
            <label className="vp-search-sortlabel">
              Sort
              <select
                className="vp-search-sortselect"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {results.length === 0 && !loading ? (
            <EmptyState hasQuery={!!q.trim()} hasFilters={activeFiltersCount > 0} />
          ) : (
            <ul className="vp-search-list" aria-label="Search results">
              {results.map((r) =>
                r.type === 'story' ? (
                  <StoryResultRow key={`s:${r.id}`} row={r} />
                ) : (
                  <ArticleResultRow key={`a:${r.id}`} row={r} />
                )
              )}
            </ul>
          )}
        </main>

        {/* Right rail */}
        <aside className="vp-search-rail" aria-label="Related">
          <RailCard title="Start here">
            <ul className="vp-rail-list">
              {topicList.slice(0, 5).map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/search?topic=${t.slug}`}
                    className="vp-rail-link"
                    onClick={(e) => {
                      e.preventDefault();
                      setTopic(t.slug);
                    }}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </RailCard>
          <RailCard title="Recently updated">
            <ul className="vp-rail-list">
              {results
                .filter((r): r is StoryRow => r.type === 'story')
                .slice(0, 5)
                .map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/${s.slug || ''}`}
                      className="vp-rail-link"
                      prefetch={false}
                    >
                      {s.title || '(untitled)'}
                    </Link>
                  </li>
                ))}
              {results.filter((r) => r.type === 'story').length === 0 && (
                <li className="vp-rail-empty">No active stories.</li>
              )}
            </ul>
          </RailCard>
        </aside>
      </div>

      {/* Bottom-sheet filters (mobile/tablet) */}
      {sheetOpen && (
        <FilterSheet
          topic={topic}
          status={status}
          dateOpt={dateOpt}
          topics={topicList}
          onTopic={setTopic}
          onStatus={(v) => setStatus(v as Status)}
          onDate={setDateOpt}
          onClose={() => setSheetOpen(false)}
          onReset={() => {
            setTopic('');
            setStatus('');
            setDateOpt('');
          }}
          resultsCount={results.length}
          loading={loading}
        />
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="vp-filter-group">
      <legend className="vp-filter-legend">{label}</legend>
      <ul className="vp-filter-list">
        {options.map((o) => (
          <li key={o.id}>
            <label className={`vp-filter-opt${value === o.id ? ' vp-filter-opt-on' : ''}`}>
              <input
                type="radio"
                name={`vp-filter-${label}`}
                value={o.id}
                checked={value === o.id}
                onChange={() => onChange(o.id)}
              />
              <span>{o.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="vp-rail-card">
      <h3 className="vp-rail-title">{title}</h3>
      {children}
    </section>
  );
}

function StoryResultRow({ row }: { row: StoryRow }) {
  return (
    <li className="vp-result-row vp-result-story">
      <Link href={`/${row.slug || ''}`} className="vp-result-link" prefetch={false}>
        <div className="vp-result-meta">
          <span className="vp-result-kind">Story</span>
          {row.lifecycle_status === 'developing' && (
            <span className="vp-pill vp-pill-developing">Developing</span>
          )}
          {row.has_recent_comments && (
            <span className="vp-pill vp-pill-discussion">Discussion active</span>
          )}
        </div>
        <h3 className="vp-result-title">{row.title || '(untitled)'}</h3>
        <div className="vp-result-footer">
          <span>{row.article_count} article{row.article_count === 1 ? '' : 's'}</span>
          {typeof row.comment_count === 'number' && row.comment_count > 0 && (
            <>
              <span aria-hidden> · </span>
              <span>
                {row.comment_count} comment{row.comment_count === 1 ? '' : 's'}
              </span>
            </>
          )}
          {(row.last_observed_at || row.latest_article_at) && (
            <>
              <span aria-hidden> · </span>
              <span>
                Updated {formatDate(row.last_observed_at || row.latest_article_at!)}
              </span>
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

function ArticleResultRow({ row }: { row: ArticleRow }) {
  const href = row.story?.slug ? `/${row.story.slug}` : '#';
  return (
    <li className="vp-result-row vp-result-article">
      <Link href={href} className="vp-result-link" prefetch={false}>
        <div className="vp-result-meta">
          <span className="vp-result-kind">Article</span>
          {row.category?.name && (
            <span className="vp-result-cat">{row.category.name}</span>
          )}
        </div>
        <h3 className="vp-result-title">{row.title || '(untitled)'}</h3>
        {row.excerpt && <p className="vp-result-excerpt">{row.excerpt}</p>}
        <div className="vp-result-footer">
          {row.story?.title && (
            <span>Part of: {row.story.title}</span>
          )}
          {row.published_at && (
            <>
              {row.story?.title ? <span aria-hidden> · </span> : null}
              <span>{formatDate(row.published_at)}</span>
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ hasQuery, hasFilters }: { hasQuery: boolean; hasFilters: boolean }) {
  if (hasQuery) {
    return (
      <div className="vp-search-empty">
        <h2>No matches</h2>
        <p>Try a shorter word, or drop a filter.</p>
      </div>
    );
  }
  if (hasFilters) {
    return (
      <div className="vp-search-empty">
        <h2>No stories fit those filters</h2>
        <p>Loosen a filter, or pick a topic.</p>
      </div>
    );
  }
  return (
    <div className="vp-search-empty">
      <h2>Pick a topic to start</h2>
      <p>Search by keyword, or pick a topic from the left.</p>
    </div>
  );
}

function FilterSheet({
  topic,
  status,
  dateOpt,
  topics,
  onTopic,
  onStatus,
  onDate,
  onClose,
  onReset,
  resultsCount,
  loading,
}: {
  topic: string;
  status: Status;
  dateOpt: string;
  topics: Topic[];
  onTopic: (v: string) => void;
  onStatus: (v: string) => void;
  onDate: (v: string) => void;
  onClose: () => void;
  onReset: () => void;
  resultsCount: number;
  loading: boolean;
}) {
  return (
    <div className="vp-sheet-overlay" role="dialog" aria-modal="true" aria-label="Filters">
      <div className="vp-sheet-backdrop" onClick={onClose} />
      <div className="vp-sheet">
        <div className="vp-sheet-head">
          <button type="button" className="vp-sheet-reset" onClick={onReset}>
            Reset
          </button>
          <button
            type="button"
            className="vp-sheet-apply"
            onClick={onClose}
            disabled={loading}
          >
            Apply{loading ? '…' : ` (${resultsCount} result${resultsCount === 1 ? '' : 's'})`}
          </button>
        </div>
        <div className="vp-sheet-body">
          <FilterGroup
            label="Topic"
            options={[
              { id: '', label: 'All topics' },
              ...topics.map((t) => ({ id: t.slug, label: t.label })),
            ]}
            value={topic}
            onChange={onTopic}
          />
          <FilterGroup
            label="Date"
            options={DATE_OPTIONS.map((d) => ({ id: d.id, label: d.label }))}
            value={dateOpt}
            onChange={onDate}
          />
          <FilterGroup
            label="Status"
            options={[
              { id: '', label: 'Any' },
              { id: 'developing', label: 'Developing' },
              { id: 'updated', label: 'Updated' },
            ]}
            value={status}
            onChange={onStatus}
          />
        </div>
      </div>
    </div>
  );
}

const styles = `
.vp-search-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 80px;
}
.vp-search-head { margin-bottom: 16px; }
.vp-search-kicker {
  font-family: var(--font-ibm-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--vp-accent);
  font-weight: 500;
  margin-bottom: 8px;
}
.vp-search-h1 {
  font-family: "Source Serif 4", var(--font-source-serif), Georgia, serif;
  font-size: 38px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--vp-ink);
  margin: 0 0 8px;
}
.vp-search-sub {
  font-size: 15px;
  color: var(--vp-text-muted);
  line-height: 1.55;
  margin: 0 0 18px;
  max-width: 640px;
}
.vp-search-bar-row { margin-bottom: 14px; }
.vp-search-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid var(--vp-border);
  background: var(--vp-surface);
  color: var(--vp-ink);
  font-size: 15px;
}
.vp-search-input:focus { outline: none; border-color: var(--vp-accent); }
.vp-search-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.vp-chip {
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--vp-border);
  background: var(--vp-surface);
  color: var(--vp-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.vp-chip:hover { border-color: var(--vp-accent); color: var(--vp-accent); }
.vp-chip-on {
  background: var(--vp-accent);
  color: #fff;
  border-color: var(--vp-accent);
}
.vp-chip-filters { display: none; }
.vp-search-typetabs {
  gap: 16px;
  border-bottom: 1px solid var(--vp-border-soft);
  margin-bottom: 16px;
  display: none;
}
.vp-typetab {
  background: none;
  border: none;
  padding: 10px 0;
  font-family: var(--font-ibm-mono);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-text-soft);
  cursor: pointer;
  position: relative;
}
.vp-typetab-on {
  color: var(--vp-ink);
}
.vp-typetab-on::after {
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: var(--vp-accent);
}
.vp-typetab-count {
  margin-left: 6px;
  font-family: var(--font-ibm-mono);
  color: var(--vp-text-soft);
}
.vp-search-grid {
  display: grid;
  grid-template-columns: 220px 1fr 300px;
  gap: 24px;
  align-items: start;
}
.vp-search-filters { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; padding-right: 4px; }
.vp-filter-group {
  border: none;
  padding: 0;
  margin: 0 0 18px;
}
.vp-filter-legend {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--vp-text-soft);
  font-weight: 500;
  margin-bottom: 8px;
  padding: 0;
}
.vp-filter-list { list-style: none; padding: 0; margin: 0; }
.vp-filter-list li { margin: 0; }
.vp-filter-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 14px;
  color: var(--vp-text-muted);
  cursor: pointer;
}
.vp-filter-opt input { margin: 0; accent-color: var(--vp-accent); }
.vp-filter-opt-on { color: var(--vp-ink); font-weight: 500; }
.vp-search-results { min-width: 0; }
.vp-search-sortrow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.vp-search-resultcount {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vp-text-soft);
  font-weight: 500;
}
.vp-search-sortlabel {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vp-text-soft);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.vp-search-sortselect {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--vp-border);
  background: var(--vp-surface);
  color: var(--vp-ink);
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
.vp-search-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.vp-result-row {
  background: var(--vp-surface);
  border: 1px solid var(--vp-border-soft);
  border-radius: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.vp-result-row:hover {
  border-color: var(--vp-border);
}
.vp-result-link {
  display: block;
  padding: 16px 18px;
  color: var(--vp-ink);
  text-decoration: none;
}
.vp-result-link:hover .vp-result-title { color: var(--vp-accent); }
.vp-result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.vp-result-kind {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-text-soft);
  font-weight: 500;
}
.vp-result-cat {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-text-muted);
}
.vp-pill {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.vp-pill-developing {
  background: var(--vp-accent-soft);
  color: var(--vp-accent-dark);
}
.vp-pill-discussion {
  background: var(--vp-surface-soft);
  color: var(--vp-text-muted);
  border: 1px solid var(--vp-border-soft);
}
.vp-result-title {
  font-family: "Source Serif 4", var(--font-source-serif), Georgia, serif;
  font-size: 20px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
  color: var(--vp-ink);
  transition: color 0.15s;
}
.vp-result-excerpt {
  font-size: 14px;
  color: var(--vp-text-muted);
  line-height: 1.55;
  margin: 0 0 6px;
}
.vp-result-footer {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vp-text-soft);
  font-weight: 500;
}
.vp-search-empty {
  padding: 48px 20px;
  text-align: center;
  border: 1px solid var(--vp-border-soft);
  border-radius: 18px;
  background: var(--vp-surface-soft);
}
.vp-search-empty h2 {
  font-family: "Source Serif 4", var(--font-source-serif), Georgia, serif;
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  color: var(--vp-ink);
}
.vp-search-empty p {
  font-size: 14px;
  color: var(--vp-text-muted);
  line-height: 1.55;
  margin: 0;
}
.vp-search-rail { position: sticky; top: 16px; margin-top: 36px; }
.vp-rail-card {
  border: 1px solid var(--vp-border-soft);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 16px;
  background: var(--vp-surface);
}
.vp-rail-title {
  font-family: var(--font-ibm-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--vp-text-soft);
  font-weight: 500;
  margin: 0 0 10px;
}
.vp-rail-list { list-style: none; padding: 0; margin: 0; }
.vp-rail-list li { padding: 6px 0; border-bottom: 1px solid var(--vp-border-soft); }
.vp-rail-list li:last-child { border-bottom: none; }
.vp-rail-link {
  font-size: 14px;
  color: var(--vp-ink);
  text-decoration: none;
  line-height: 1.4;
}
.vp-rail-link:hover { color: var(--vp-accent); }
.vp-rail-empty {
  font-size: 13px;
  color: var(--vp-text-soft);
  font-style: italic;
}

/* Tablet: hide left rail, show Filters chip + bottom sheet. */
@media (max-width: 1100px) {
  .vp-search-grid {
    grid-template-columns: 1fr 300px;
  }
  .vp-search-filters { display: none; }
  .vp-chip-filters { display: inline-flex; }
}

/* Mobile: single column + type tab row + Filters sheet. */
@media (max-width: 840px) {
  .vp-search-shell { padding: 12px 12px 80px; }
  .vp-search-grid { grid-template-columns: 1fr; }
  .vp-search-rail { display: none; }
  .vp-search-typetabs { display: flex; }
  .vp-search-h1 { font-size: 28px; }
}

/* Bottom sheet */
.vp-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
}
.vp-sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
}
.vp-sheet {
  position: relative;
  background: var(--vp-surface);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  padding-bottom: 24px;
  box-shadow: 0 -12px 24px rgba(0,0,0,0.15);
}
.vp-sheet-head {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--vp-border-soft);
  position: sticky;
  top: 0;
  background: var(--vp-surface);
}
.vp-sheet-reset, .vp-sheet-apply {
  background: none;
  border: none;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
}
.vp-sheet-reset { color: var(--vp-text-muted); }
.vp-sheet-apply {
  background: var(--vp-accent);
  color: #fff;
}
.vp-sheet-apply:disabled { opacity: 0.6; cursor: default; }
.vp-sheet-body { padding: 16px; }
`;
