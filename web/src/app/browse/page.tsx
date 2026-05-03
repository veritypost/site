'use client';
import React, { useState, useMemo, useRef, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { usePageViewTrack } from '@/lib/useTrack';
import Ad from '@/components/Ad';

const SERIF = "var(--font-serif, 'Source Serif 4', Georgia, serif)";
const SANS  = "var(--font-sans, Inter, system-ui, sans-serif)";

const C = {
  bg:           'var(--bg, #ffffff)',
  surface:      'var(--card, #f7f7f7)',
  text:         'var(--text, #111111)',
  soft:         'var(--text-secondary, #444444)',
  dim:          'var(--dim, #5a5a5a)',
  muted:        'var(--dim-more, #999999)',
  border:       'var(--border, #e5e5e5)',
  breaking:     '#ef4444',
  breakingBg:   'var(--breaking-bg, rgba(239,68,68,0.04))',
  developing:   '#f59e0b',
  developingBg: 'var(--developing-bg, rgba(245,158,11,0.025))',
  resolved:     'var(--dim, #9ca3af)',
} as const;

type Lifecycle    = 'breaking' | 'developing' | 'resolved';
type DisplayGroup = 'today' | 'yesterday' | 'this_week' | 'earlier';
type SortKey      = 'recent' | 'coverage' | 'duration';
type CoverageKey  = 'any' | 'light' | 'medium' | 'heavy';
interface Article { date: string; headline: string; slug?: string }
interface Story {
  id: string;
  lifecycle: Lifecycle;
  title: string;
  category: string;
  articles: Article[];
  displayGroup: DisplayGroup;
  slug?: string;
}

interface FilterState {
  lifecycle: Lifecycle[];
  dateFrom: string;
  dateTo: string;
  coverage: CoverageKey;
  // quiz filter: add FilterSection here when quiz data is available on clusters
  sort: SortKey;
}

const DEFAULT_FILTERS: FilterState = {
  lifecycle: [], dateFrom: '', dateTo: '',
  coverage: 'any', sort: 'recent',
};

function lcColor(lc: Lifecycle) {
  if (lc === 'breaking')   return C.breaking;
  if (lc === 'developing') return C.developing;
  return C.resolved;
}
function latestMs(s: Story)     { return Math.max(...s.articles.map(a => +new Date(a.date))); }
function earliestMs(s: Story)   { return Math.min(...s.articles.map(a => +new Date(a.date))); }
function durationDays(s: Story) { return Math.round((latestMs(s) - earliestMs(s)) / 86_400_000); }
function latestHeadline(s: Story) { return s.articles[s.articles.length - 1]?.headline ?? ''; }
function relTime(ms: number) {
  const h = (Date.now() - ms) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms));
}
function fmtDate(s: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(s));
}
function getDisplayGroup(updatedAt: string): DisplayGroup {
  const h = (Date.now() - new Date(updatedAt).getTime()) / 3_600_000;
  if (h < 24)      return 'today';
  if (h < 48)      return 'yesterday';
  if (h < 7 * 24)  return 'this_week';
  return 'earlier';
}

// ── Data fetching ──────────────────────────────────────────────────────────

type ClusterRow = {
  id: string;
  title: string | null;
  is_breaking: boolean | null;
  is_active: boolean | null;
  archived_at: string | null;
  updated_at: string | null;
  categories: { name: string | null } | null;
  feed_cluster_articles: {
    added_at: string | null;
    articles: { title: string | null; published_at: string | null; status: string | null; stories: { slug: string } | null } | null;
  }[];
};

function toStory(row: ClusterRow): Story | null {
  if (!row.title) return null;
  const articles = (row.feed_cluster_articles ?? [])
    .filter(fca => fca.articles?.status === 'published' && fca.articles?.title && fca.articles?.published_at)
    .map(fca => ({
      date: fca.articles!.published_at!.slice(0, 10),
      headline: fca.articles!.title!,
      slug: fca.articles!.stories?.slug ?? undefined,
    }))
    // YYYY-MM-DD string sort is correct for day resolution; same-day order is not guaranteed
    .sort((a, b) => a.date.localeCompare(b.date));

  if (articles.length === 0) return null;

  return {
    id: row.id,
    lifecycle: row.archived_at ? 'resolved' : row.is_breaking ? 'breaking' : 'developing',
    title: row.title,
    category: row.categories?.name ?? 'General',
    articles,
    displayGroup: getDisplayGroup(row.updated_at ?? new Date().toISOString()),
    slug: [...articles].reverse().find(a => a.slug)?.slug,
  };
}

async function loadStories(): Promise<Story[]> {
  const supabase = createClient();
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('feed_clusters')
    .select(`
      id, title, is_breaking, is_active, archived_at, updated_at,
      categories(name),
      feed_cluster_articles(added_at, articles(title, published_at, status, stories(slug)))
    `)
    .is('dismissed_at', null)
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(80);

  if (error) throw new Error(error.message);
  if (!data) return [];
  return (data as unknown as ClusterRow[]).map(toStory).filter((s): s is Story => s !== null);
}

// ── Coverage mini-timeline ─────────────────────────────────────────────────

function CoverageTimeline({ story }: { story: Story }) {
  const color  = lcColor(story.lifecycle);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; label: string } | null>(null);

  const dayMap = new Map<string, number>();
  for (const a of story.articles) dayMap.set(a.date, (dayMap.get(a.date) ?? 0) + 1);
  const dates  = Array.from(dayMap.keys()).sort();
  const minT   = dates.length >= 2 ? +new Date(dates[0]) : 0;
  const maxT   = dates.length >= 2 ? +new Date(dates[dates.length - 1]) : 0;
  const range  = maxT - minT || 1;
  const maxCnt = dates.length > 0 ? Math.max(...Array.from(dayMap.values())) : 1;
  const MAX_H  = 20, MIN_H = 4;

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (dates.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetT = minT + pct * range;
    let closest = dates[0];
    let closestDiff = Infinity;
    for (const d of dates) {
      const diff = Math.abs(+new Date(d) - targetT);
      if (diff < closestDiff) { closestDiff = diff; closest = d; }
    }
    const cnt = dayMap.get(closest) ?? 0;
    const barPct = ((+new Date(closest) - minT) / range) * 100;
    setTip({ x: barPct, label: `${fmtDate(closest)} · ${cnt} article${cnt !== 1 ? 's' : ''}` });
  }, [dates, dayMap, minT, range]);

  if (dates.length < 2) return null;

  return (
    <div style={{ position: 'relative', marginBottom: 14, cursor: 'crosshair' }}
      onMouseMove={handleMove}
      onMouseLeave={() => setTip(null)}
      onTouchMove={handleMove}
      onTouchEnd={() => setTip(null)}
    >
      {tip && (
        <div ref={tipRef} style={{
          position: 'absolute', bottom: '100%',
          left: `clamp(40px, ${tip.x}%, calc(100% - 60px))`,
          transform: 'translateX(-50%)',
          background: C.text, color: 'var(--bg, #fff)', fontSize: 10, fontFamily: SANS,
          fontWeight: 600, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
          pointerEvents: 'none', marginBottom: 6, zIndex: 10,
        }}>
          {tip.label}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderTop: `4px solid ${C.text}`,
          }}/>
        </div>
      )}
      <div style={{ height: MAX_H + 4, position: 'relative' }}>
        {dates.map((date) => {
          const pct    = ((+new Date(date) - minT) / range);
          const cnt    = dayMap.get(date) ?? 1;
          const h      = MIN_H + ((cnt / maxCnt) * (MAX_H - MIN_H));
          const isLast = date === dates[dates.length - 1];
          return (
            <div key={date} style={{
              position: 'absolute', bottom: 0,
              left: `${Math.min(pct * 100, 97)}%`,
              width: isLast ? 4 : 3, height: h,
              background: isLast ? color : `${color}50`,
              borderRadius: 2,
              boxShadow: isLast ? `0 0 5px ${color}88` : 'none',
            }}/>
          );
        })}
      </div>
      <div style={{ height: 1, background: C.border, marginTop: 3, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 0, top: 3, fontSize: 9, color: C.muted, fontFamily: SANS, fontWeight: 500 }}>
          {fmtDate(dates[0])}
        </span>
        <span style={{ position: 'absolute', right: 0, top: 3, fontSize: 9, color, fontFamily: SANS, fontWeight: 600 }}>
          {fmtDate(dates[dates.length - 1])}
        </span>
      </div>
    </div>
  );
}

// ── Story card ─────────────────────────────────────────────────────────────

function StoryCard({ story }: {
  story: Story;
}) {
  const color      = lcColor(story.lifecycle);
  const dur        = durationDays(story);
  const latest     = latestHeadline(story);
  const lms        = story.articles.length > 0 ? latestMs(story) : Date.now();
  const isResolved = story.lifecycle === 'resolved';

  const titleSize   = story.lifecycle === 'breaking' ? 22 : story.lifecycle === 'developing' ? 18 : 15;
  const titleWeight = story.lifecycle === 'breaking' ? 800 : story.lifecycle === 'developing' ? 700 : 400;
  const borderLeft  = story.lifecycle === 'breaking' ? `4px solid ${C.breaking}` : story.lifecycle === 'developing' ? `2px solid ${C.developing}` : `1px solid ${C.border}`;

  const slug = story.slug ?? null;

  const cardContent = (
    <div style={{
      borderLeft,
      background: story.lifecycle === 'breaking' ? C.breakingBg : story.lifecycle === 'developing' ? C.developingBg : 'transparent',
      paddingLeft: 16, paddingRight: 20, paddingTop: 18, paddingBottom: 16,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {story.lifecycle === 'breaking' && (
              <span className="vp-live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: C.breaking, display: 'inline-block', flexShrink: 0 }}/>
            )}
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color, fontFamily: SANS }}>
              {story.lifecycle}
            </span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontFamily: SANS }}>
            {story.category}
          </span>
        </div>
        <span style={{ fontSize: 10, color: isResolved ? C.muted : color, fontFamily: SANS, fontWeight: 500, flexShrink: 0 }}>
          {relTime(lms)}
        </span>
      </div>

      <div style={{ fontFamily: SERIF, fontSize: titleSize, fontWeight: titleWeight, lineHeight: 1.22, letterSpacing: titleSize >= 20 ? '-0.02em' : '-0.01em', color: isResolved ? C.dim : C.text, marginBottom: 12 }}>
        {story.title}
      </div>

      <CoverageTimeline story={story} />

      {latest && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: isResolved ? C.muted : color, fontFamily: SANS, marginRight: 6 }}>
            {isResolved ? 'Final' : 'Latest'}
          </span>
          <span style={{ fontSize: 13, color: isResolved ? C.dim : C.soft, fontFamily: SERIF, lineHeight: 1.45 }}>
            {latest}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
          {story.articles.length} articles
          {dur > 0 && <> · <span style={{ color: isResolved ? C.muted : C.dim }}>{dur}d story</span></>}
        </span>
      </div>
    </div>
  );

  if (slug) {
    return (
      <Link href={`/${slug}`} style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
        {cardContent}
      </Link>
    );
  }
  return <div style={{ cursor: 'default', opacity: 0.7 }}>{cardContent}</div>;
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 20px 12px', margin: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted, fontFamily: SANS, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }}/>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: SANS, flexShrink: 0 }}>{count}</span>
    </h2>
  );
}

// ── Filter pill ────────────────────────────────────────────────────────────

function PillToggle({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  const c = color || C.text;
  return (
    <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 20, fontFamily: SANS, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', border: active ? 'none' : `1px solid ${C.border}`, background: active ? c : 'transparent', color: active ? 'var(--bg, #fff)' : C.dim, transition: 'all 150ms ease', whiteSpace: 'nowrap', minHeight: 44 }}>
      {label}
    </button>
  );
}

// ── Filter sheet ───────────────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontFamily: SANS, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FilterSheet({ open, filters, onClose, onChange, resultCount }: {
  open: boolean; filters: FilterState; onClose: () => void; onChange: (f: FilterState) => void; resultCount: number;
}) {
  const toggleLc = (lc: Lifecycle) => {
    const next = filters.lifecycle.includes(lc) ? filters.lifecycle.filter(x => x !== lc) : [...filters.lifecycle, lc];
    onChange({ ...filters, lifecycle: next });
  };
  const hasFilters = filters.lifecycle.length > 0 || filters.dateFrom || filters.dateTo || filters.coverage !== 'any' || filters.sort !== 'recent';
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && sheetRef.current) {
      const first = sheetRef.current.querySelector<HTMLElement>('button, input, [tabindex="0"]');
      first?.focus();
    }
  }, [open]);

  return (
    <>
      <div onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 250ms ease', backdropFilter: 'blur(2px)' }}/>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: C.bg, borderRadius: '18px 18px 0 0', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)', transform: open ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 320ms cubic-bezier(0.4,0,0.2,1)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px', borderBottom: `1px solid ${C.border}` }}>
          <span id="filter-sheet-title" style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: SANS }}>Advanced Filters</span>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {hasFilters && (
              <button onClick={() => onChange(DEFAULT_FILTERS)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.breaking, fontFamily: SANS, fontWeight: 600, padding: 0 }}>
                Clear all
              </button>
            )}
            <button onClick={onClose} aria-label="Close filters" style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: C.dim }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="vp-filter-sheet-content" style={{ overflowY: 'auto', flex: 1, padding: '20px 20px 0' }}>
          <FilterSection title="Sort by">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['recent', 'coverage', 'duration'] as SortKey[]).map(s => (
                <PillToggle key={s} label={s === 'recent' ? 'Most Recent' : s === 'coverage' ? 'Most Coverage' : 'Longest Running'} active={filters.sort === s} onClick={() => onChange({ ...filters, sort: s })}/>
              ))}
            </div>
          </FilterSection>
          <FilterSection title="Status">
            <div style={{ display: 'flex', gap: 8 }}>
              <PillToggle label="Breaking"  active={filters.lifecycle.includes('breaking')}  color={C.breaking}  onClick={() => toggleLc('breaking')} />
              <PillToggle label="Developing" active={filters.lifecycle.includes('developing')} color={C.developing} onClick={() => toggleLc('developing')} />
              <PillToggle label="Resolved"  active={filters.lifecycle.includes('resolved')}  color={C.dim}       onClick={() => toggleLc('resolved')} />
            </div>
          </FilterSection>
          <FilterSection title="Date range">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, marginBottom: 5 }}>From</div>
                <input type="date" value={filters.dateFrom} onChange={e => onChange({ ...filters, dateFrom: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${filters.dateFrom ? C.text : C.border}`, fontSize: 13, fontFamily: SANS, color: C.text, background: C.bg, boxSizing: 'border-box', outline: 'none' }}/>
              </div>
              <span style={{ color: C.muted, fontSize: 12, marginTop: 18 }}>→</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, marginBottom: 5 }}>To</div>
                <input type="date" value={filters.dateTo} onChange={e => onChange({ ...filters, dateTo: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${filters.dateTo ? C.text : C.border}`, fontSize: 13, fontFamily: SANS, color: C.text, background: C.bg, boxSizing: 'border-box', outline: 'none' }}/>
              </div>
            </div>
          </FilterSection>
          <FilterSection title="Coverage depth">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['any', 'Any'], ['light', 'Light  <5'], ['medium', 'In Depth  5–15'], ['heavy', 'Major  15+']] as [CoverageKey, string][]).map(([k, label]) => (
                <PillToggle key={k} label={label} active={filters.coverage === k} onClick={() => onChange({ ...filters, coverage: k })}/>
              ))}
            </div>
          </FilterSection>
          <div style={{ height: 20 }}/>
        </div>
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.border}`, background: C.bg, paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          {(() => { const dateRangeInvalid = !!(filters.dateTo && filters.dateFrom && filters.dateTo < filters.dateFrom); return (<>
            {dateRangeInvalid && (
              <p style={{ color: 'var(--error, #dc2626)', fontSize: 13, marginTop: 0, marginBottom: 8 }}>End date must be after start date.</p>
            )}
            <button onClick={onClose} disabled={dateRangeInvalid} style={{ width: '100%', padding: '14px', borderRadius: 12, background: C.text, color: 'var(--bg, #fff)', border: 'none', cursor: dateRangeInvalid ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, fontFamily: SANS, opacity: dateRangeInvalid ? 0.5 : 1 }}>
              Show {resultCount} {resultCount === 1 ? 'story' : 'stories'}
            </button>
          </>); })()}
        </div>
      </div>
    </>
  );
}

// ── Active filter pills ────────────────────────────────────────────────────

const COVERAGE_LABELS: Record<string, string> = { light: 'Light (<5)', medium: 'In Depth (5–15)', heavy: 'Major (15+)' };
const SORT_LABELS: Record<string, string> = { coverage: 'Most Coverage', duration: 'Longest Running' };

function ActiveFilters({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  const pills: { label: string; clear: () => void }[] = [];
  filters.lifecycle.forEach(lc => pills.push({ label: lc.charAt(0).toUpperCase() + lc.slice(1), clear: () => onChange({ ...filters, lifecycle: filters.lifecycle.filter(x => x !== lc) }) }));
  if (filters.dateFrom) pills.push({ label: `From ${fmtDate(filters.dateFrom)}`, clear: () => onChange({ ...filters, dateFrom: '' }) });
  if (filters.dateTo)   pills.push({ label: `To ${fmtDate(filters.dateTo)}`,     clear: () => onChange({ ...filters, dateTo: '' }) });
  if (filters.coverage !== 'any') pills.push({ label: `Coverage: ${COVERAGE_LABELS[filters.coverage] ?? filters.coverage}`, clear: () => onChange({ ...filters, coverage: 'any' }) });
  if (filters.sort !== 'recent')  pills.push({ label: `Sort: ${SORT_LABELS[filters.sort] ?? filters.sort}`,                 clear: () => onChange({ ...filters, sort: 'recent' }) });
  if (pills.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {pills.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 11, color: C.text, fontFamily: SANS, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {p.label}
          <button onClick={p.clear} aria-label={`Remove filter: ${p.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '8px', lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function BrowseSkeleton() {
  return (
    <div aria-hidden="true" style={{ paddingTop: 'calc(188px + var(--vp-top-bar-h, 0px))' }}>
      <style>{`@media (prefers-reduced-motion: no-preference) { @keyframes vp-sk { 0%,100%{opacity:1}50%{opacity:0.45} } .vp-sk { animation: vp-sk 1.6s ease-in-out infinite; } }`}</style>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ borderBottom: `1px solid ${C.border}`, padding: '18px 20px 16px', borderLeft: `${i === 0 ? 4 : 2}px solid ${i === 0 ? C.breaking : C.developing}`, background: i === 0 ? C.breakingBg : C.developingBg }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 52, height: 10, borderRadius: 4, background: C.border, animation: 'vp-sk 1.6s ease-in-out infinite' }}/>
            <div style={{ width: 64, height: 10, borderRadius: 4, background: C.border, animation: 'vp-sk 1.6s ease-in-out infinite' }}/>
          </div>
          <div style={{ width: '80%', height: i === 0 ? 22 : 18, borderRadius: 4, background: C.border, animation: 'vp-sk 1.6s ease-in-out infinite', marginBottom: 8 }}/>
          <div style={{ width: '60%', height: i === 0 ? 22 : 18, borderRadius: 4, background: C.border, animation: 'vp-sk 1.6s ease-in-out infinite' }}/>
        </div>
      ))}
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const GROUP_ORDER: DisplayGroup[] = ['today', 'yesterday', 'this_week', 'earlier'];
const GROUP_LABELS: Record<DisplayGroup, string> = {
  today: 'TODAY', yesterday: 'YESTERDAY', this_week: 'THIS WEEK', earlier: 'EARLIER (90 DAYS)',
};

function buildParams(filters: FilterState, category: string, query: string): string {
  const p = new URLSearchParams();
  if (category && category !== 'All') p.set('cat', category);
  if (query) p.set('q', query);
  if (filters.sort !== DEFAULT_FILTERS.sort) p.set('sort', filters.sort);
  if (filters.lifecycle.length > 0) p.set('lc', filters.lifecycle.join(','));
  if (filters.coverage !== DEFAULT_FILTERS.coverage) p.set('cov', filters.coverage);
  if (filters.dateFrom) p.set('from', filters.dateFrom);
  if (filters.dateTo) p.set('to', filters.dateTo);
  return p.toString();
}

// ── Main page ──────────────────────────────────────────────────────────────

function BrowsePageInner() {
  usePageViewTrack('browse');

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [stories,     setStories]     = useState<Story[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadFailed,  setLoadFailed]  = useState(false);
  const [query,       setQuery]       = useState(() => searchParams.get('q') ?? '');
  const [category,    setCategory]    = useState(() => searchParams.get('cat') ?? 'All');
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [filters,     setFilters]     = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    sort: (searchParams.get('sort') as FilterState['sort']) ?? DEFAULT_FILTERS.sort,
    lifecycle: searchParams.get('lc') ? (searchParams.get('lc')!.split(',') as Lifecycle[]) : DEFAULT_FILTERS.lifecycle,
    coverage: (searchParams.get('cov') as FilterState['coverage']) ?? DEFAULT_FILTERS.coverage,
    dateFrom: searchParams.get('from') ?? '',
    dateTo: searchParams.get('to') ?? '',
  }));
  const abortRef = useRef<AbortController | null>(null);

  const fetchStories = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStories([]);
    setLoadFailed(false);
    setLoading(true);
    loadStories()
      .then(data => {
        if (controller.signal.aborted) return;
        setStories(data); setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadFailed(true); setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  useEffect(() => {
    const qs = buildParams(filters, category, query);
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [filters, category, query, pathname, router]);

  useEffect(() => {
    document.body.style.overflow = filterOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [filterOpen]);

  const cats = useMemo(() => {
    const seen = new Set<string>();
    stories.forEach(s => seen.add(s.category));
    return ['All', ...Array.from(seen).sort()];
  }, [stories]);

  const activeFilterCount = useMemo(() => {
    let n = filters.lifecycle.length;
    if (filters.dateFrom)          n++;
    if (filters.dateTo)            n++;
    if (filters.coverage !== 'any') n++;
    if (filters.sort !== 'recent')  n++;
    return n;
  }, [filters]);

  const isMatch = useCallback((story: Story): boolean => {
    if (category !== 'All' && story.category !== category) return false;
    if (filters.lifecycle.length > 0 && !filters.lifecycle.includes(story.lifecycle)) return false;
    if (filters.coverage !== 'any') {
      const n = story.articles.length;
      if (filters.coverage === 'light'  && n >= 5)          return false;
      if (filters.coverage === 'medium' && (n < 5 || n > 15)) return false;
      if (filters.coverage === 'heavy'  && n <= 15)          return false;
    }
    // Semantics: story overlaps range if any article date falls within the window. A multi-month story is relevant to any range inside it.
    if (filters.dateFrom) {
      if (story.articles.length > 0 && latestMs(story) < +new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo) {
      if (story.articles.length > 0 && earliestMs(story) > +new Date(filters.dateTo)) return false;
    }
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      if (!story.title.toLowerCase().includes(q) &&
          !story.category.toLowerCase().includes(q) &&
          !story.articles.some(a => a.headline.toLowerCase().includes(q))) return false;
    }
    return true;
  }, [query, category, filters]);

  const sorted = useCallback((list: Story[]) => {
    return [...list].sort((a, b) => {
      if (filters.sort === 'coverage') return b.articles.length - a.articles.length;
      if (filters.sort === 'duration') return durationDays(b) - durationDays(a);
      if (a.articles.length === 0) return 1;
      if (b.articles.length === 0) return -1;
      return latestMs(b) - latestMs(a);
    });
  }, [filters.sort]);

  const grouped = useMemo(() => {
    const map = new Map<DisplayGroup, Story[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const story of stories) {
      const group = getDisplayGroup(story.articles[story.articles.length - 1]?.date ?? new Date().toISOString());
      map.get(group)?.push(story);
    }
    const result: { group: DisplayGroup; stories: Story[] }[] = [];
    for (const g of GROUP_ORDER) {
      const matching = sorted((map.get(g) ?? []).filter(isMatch));
      if (matching.length > 0) result.push({ group: g, stories: matching });
    }
    return result;
  }, [stories, isMatch, sorted]);

  const totalMatching = useMemo(() => stories.filter(isMatch).length, [stories, isMatch]);

  if (loading) return <BrowseSkeleton />;

  if (loadFailed) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: SANS }}>Couldn&rsquo;t load stories</div>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS }}>Check your connection and try again.</div>
      <button onClick={fetchStories} style={{ padding: '10px 20px', borderRadius: 10, background: C.text, color: 'var(--bg, #fff)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: SANS }}>
        Retry
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes vp-live-pulse { 0%,100%{opacity:0.5;transform:scale(0.8)} 15%{opacity:1;transform:scale(1.3);box-shadow:0 0 0 4px rgba(239,68,68,0.2)} }
          .vp-live-dot { animation: vp-live-pulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite; }
        }
        * { -webkit-tap-highlight-color: transparent; }
        button:focus-visible, a:focus-visible { outline: 2px solid var(--text, #111); outline-offset: 2px; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
        .vp-chip-rail::-webkit-scrollbar { display: none }
        .vp-filter-sheet-content::-webkit-scrollbar { display: none }
      `}</style>

      {/* Fixed header */}
      <div style={{ position: 'fixed', top: 'var(--vp-top-bar-h, 0px)', left: 0, right: 0, zIndex: 100, background: 'var(--bg-glass, rgba(255,255,255,0.97))', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px', maxWidth: 720, margin: '0 auto' }}>
          <span style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: C.text }}>Browse</span>
          <span aria-live="polite" aria-atomic="true" style={{ fontSize: 10, color: C.muted, fontFamily: SANS, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {totalMatching} {totalMatching === 1 ? 'story' : 'stories'}
          </span>
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 16px 8px', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface, borderRadius: 12, padding: '10px 14px', border: `1px solid ${query ? C.text + '44' : 'transparent'}`, transition: 'border-color 150ms ease' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search stories and headlines…" aria-label="Search stories and headlines" aria-describedby="search-hint" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: C.text, width: '100%', fontFamily: SANS }}/>
            {query && <button onClick={() => setQuery('')} aria-label="Clear search" style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>}
            <div style={{ width: 1, height: 16, background: C.border, flexShrink: 0 }}/>
            <button onClick={() => setFilterOpen(true)} aria-label="Open filters" aria-expanded={filterOpen} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activeFilterCount > 0 ? C.text : C.muted} strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: activeFilterCount > 0 ? 700 : 500, color: activeFilterCount > 0 ? C.text : C.muted, fontFamily: SANS }}>
                {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
              </span>
            </button>
          </div>
          <span id="search-hint" className="sr-only">Type at least 2 characters to search</span>
          {query.length === 1 && <span style={{ fontSize: 11, color: 'var(--dim, #999)', marginTop: 2, display: 'block' }}>Type 2+ characters to search</span>}
        </div>

        {/* Category chips */}
        <div className="vp-chip-rail" style={{ display: 'flex', gap: 6, padding: '0 16px 12px', overflowX: 'auto', scrollbarWidth: 'none', maxWidth: 720, margin: '0 auto', maskImage: 'linear-gradient(to right, black, black calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(to right, black, black calc(100% - 24px), transparent)' }}>
          {cats.map(cat => {
            const active = cat === category;
            return (
              <button key={cat} onClick={() => setCategory(cat)} style={{ border: active ? 'none' : `1px solid ${C.border}`, background: active ? C.text : 'transparent', color: active ? 'var(--bg, #fff)' : C.dim, fontSize: 12, fontWeight: active ? 700 : 500, borderRadius: 20, padding: '5px 14px', cursor: 'pointer', flexShrink: 0, fontFamily: SANS, transform: active ? 'scale(1.04)' : 'scale(1)', transition: 'all 140ms cubic-bezier(0.34,1.56,0.64,1)', minHeight: 44 }}>
                {cat}
              </button>
            );
          })}
        </div>

        <ActiveFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Content */}
      <main style={{ maxWidth: 720, margin: '0 auto', paddingTop: `calc(${activeFilterCount > 0 ? 220 : 188}px + var(--vp-top-bar-h, 0px))`, paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>

        {/* browse_top: above category grid */}
        <Ad placement="browse_top" page="browse" position="top" />

        {grouped.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: SERIF, marginBottom: 6 }}>
              {stories.length === 0 ? 'No stories yet' : 'No stories match'}
            </div>
            <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, marginBottom: 20 }}>
              {query ? `Nothing found for "${query}"` : 'Try adjusting your filters'}
            </div>
            {(query || activeFilterCount > 0) && (
              <button onClick={() => { setQuery(''); setCategory('All'); setFilters(DEFAULT_FILTERS); }} style={{ padding: '10px 20px', borderRadius: 10, background: C.text, color: 'var(--bg, #fff)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: SANS }}>
                Clear all filters
              </button>
            )}
            {!query && activeFilterCount === 0 && (
              <a href="/" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', background: 'var(--text, #111)', color: 'var(--bg, #fff)', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>← Back to front page</a>
            )}
          </div>
        )}

        {grouped.map(({ group, stories: groupStories }) => (
          <div key={group}>
            <SectionHeader label={GROUP_LABELS[group]} count={groupStories.length} />
            {groupStories.map(story => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        ))}
      </main>

      <FilterSheet open={filterOpen} filters={filters} onClose={() => setFilterOpen(false)} onChange={setFilters} resultCount={totalMatching} />
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowsePageInner />
    </Suspense>
  );
}
