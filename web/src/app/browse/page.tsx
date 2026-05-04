'use client';
import React, { useState, useMemo, useRef, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { usePageViewTrack } from '@/lib/useTrack';
import Ad from '@/components/Ad';
import { HOME_COLORS, HOME_SERIF_STACK } from '../_homeShared';

const SERIF = HOME_SERIF_STACK;
const SANS  = "var(--font-sans, Inter, system-ui, sans-serif)";

const C = {
  bg:        HOME_COLORS.bg,
  text:      HOME_COLORS.text,
  soft:      HOME_COLORS.soft,
  dim:       HOME_COLORS.dim,
  muted:     HOME_COLORS.muted,
  border:    HOME_COLORS.rule,
  hairline:  HOME_COLORS.rule,
  faint:     'var(--p-ink-faint)',
  surface:   'var(--p-border)',
  danger:    'var(--danger, #dc2626)',
} as const;

type Density = 'comfortable' | 'compact' | 'grid';
type SortKey = 'newest' | 'oldest' | 'most_articles';

interface Article { id: string; date: string; headline: string; subtitle?: string; excerpt?: string; slug?: string }
interface Story {
  id: string;
  title: string;
  category: string;
  articles: Article[];
  slug?: string;
  updatedAt: number;
}

function latestMs(s: Story)   { return s.articles.length === 0 ? s.updatedAt : Math.max(...s.articles.map(a => +new Date(a.date))); }
function earliestMs(s: Story) { return s.articles.length === 0 ? s.updatedAt : Math.min(...s.articles.map(a => +new Date(a.date))); }
function relTime(ms: number) {
  const h = (Date.now() - ms) / 3_600_000;
  if (h < 1)   return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24)  return `${Math.round(h)}h ago`;
  if (h < 168) return `${Math.round(h / 24)}d ago`;
  return Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms));
}

// ── Data ──────────────────────────────────────────────────────────────────

type ClusterRow = {
  id: string; title: string | null; is_active: boolean | null; updated_at: string | null;
  categories: { name: string | null } | null;
  feed_cluster_articles: {
    added_at: string | null;
    articles: { id: string; title: string | null; subtitle: string | null; excerpt: string | null; published_at: string | null; status: string | null; stories: { slug: string } | null } | null;
  }[];
};

function toStory(row: ClusterRow): Story | null {
  if (!row.title) return null;
  const articles = (row.feed_cluster_articles ?? [])
    .filter(fca => fca.articles?.status === 'published' && fca.articles?.title && fca.articles?.published_at)
    .map(fca => ({
      id:       fca.articles!.id,
      date:     fca.articles!.published_at!.slice(0, 10),
      headline: fca.articles!.title!,
      subtitle: fca.articles!.subtitle ?? undefined,
      excerpt:  fca.articles!.excerpt ?? undefined,
      slug:     fca.articles!.stories?.slug ?? undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (articles.length === 0) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.categories?.name ?? 'General',
    articles,
    slug: [...articles].reverse().find(a => a.slug)?.slug,
    updatedAt: row.updated_at ? +new Date(row.updated_at) : Date.now(),
  };
}

async function loadStories(signal: AbortSignal): Promise<Story[]> {
  const supabase = createClient();
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('feed_clusters')
    .select(`
      id, title, is_active, updated_at,
      categories(name),
      feed_cluster_articles(added_at, articles(id, title, subtitle, excerpt, published_at, status, stories(slug)))
    `)
    .eq('is_active', true)
    .eq('audience', 'adult')
    .is('dismissed_at', null)
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(120)
    .abortSignal(signal);
  if (error) {
    if (signal.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    throw new Error(error.message);
  }
  if (!data) return [];
  return (data as unknown as ClusterRow[]).map(toStory).filter((s): s is Story => s !== null);
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function SideRow({ label, count, active, onClick }: {
  label: string; count?: number; active?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'baseline', gap: 8,
      padding: '7px 14px',
      background: active ? C.text : 'transparent', borderRadius: 4, border: 'none',
      cursor: 'pointer',
      fontFamily: SANS, fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? 'var(--p-bg)' : C.soft,
      textAlign: 'left', minHeight: 32,
    }}>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: active ? 'var(--p-bg)' : C.faint, fontWeight: 500, opacity: active ? 0.75 : 1, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
    </button>
  );
}

function SideHeader({ label }: { label: string }) {
  return (
    <div style={{ padding: '14px 14px 6px' }}>
      <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>{label}</span>
    </div>
  );
}

function Sidebar({ collapsed, mobileOpen, onToggle, onMobileClose, activeCat, onCat, allCats }: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
  activeCat: string | null;
  onCat: (c: string | null) => void;
  allCats: { name: string; count: number }[];
}) {
  const baseAside: React.CSSProperties = {
    width: collapsed ? 48 : 232,
    borderRight: `1px solid ${C.hairline}`,
    background: C.bg,
    display: 'flex', flexDirection: 'column',
    position: 'sticky', top: 'var(--vp-top-bar-h, 0px)',
    height: 'calc(100vh - var(--vp-top-bar-h, 0px))',
    flexShrink: 0,
  };
  if (collapsed) {
    return (
      <aside className="vp-sidebar" style={baseAside}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SERIF, fontSize: 22, fontWeight: 800, color: C.text, paddingTop: 18 }}>V</button>
      </aside>
    );
  }
  return (
    <>
      {mobileOpen && (
        <div onClick={onMobileClose} className="vp-sidebar-backdrop" style={{
          position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(0,0,0,0.4)', display: 'none',
        }}/>
      )}
      <aside className={`vp-sidebar ${mobileOpen ? 'vp-sidebar-open' : ''}`} style={baseAside}>
        <div style={{ padding: '18px 14px 12px', display: 'flex', alignItems: 'baseline', borderBottom: `1px solid ${C.hairline}` }}>
          <span style={{ flex: 1, fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Browse</span>
          <button onClick={onToggle} className="vp-sidebar-collapse-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 11, color: C.muted }}>collapse</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px 16px' }}>
          <SideRow label="all stories" active={!activeCat} onClick={() => onCat(null)} />

          <SideHeader label="categories" />
          {allCats.map(c => (
            <SideRow key={c.name}
              label={c.name.toLowerCase()}
              count={c.count}
              active={activeCat === c.name}
              onClick={() => onCat(activeCat === c.name ? null : c.name)} />
          ))}
        </div>
      </aside>
    </>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────

function DensityToggle({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  const opts: [Density, string][] = [['comfortable', 'comfortable'], ['compact', 'compact'], ['grid', 'grid']];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline' }}>
      {opts.map(([k, label], i) => (
        <React.Fragment key={k}>
          {i > 0 && <span style={{ color: C.muted, margin: '0 8px' }}>·</span>}
          <button onClick={() => onChange(k)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: SANS, fontSize: 12, fontWeight: density === k ? 700 : 500,
            color: density === k ? C.text : C.muted,
            textDecoration: density === k ? 'underline' : 'none',
            textUnderlineOffset: 4, textDecorationThickness: 1.5,
          }}>{label}</button>
        </React.Fragment>
      ))}
    </div>
  );
}

function SortDropdown({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const opts: [SortKey, string][] = [
    ['newest',        'newest first'],
    ['oldest',        'oldest first'],
    ['most_articles', 'most articles'],
  ];
  const active = opts.find(o => o[0] === sort)?.[1] ?? 'newest first';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: SANS, fontSize: 12, color: C.dim,
      }}>
        sort: <span style={{ color: C.text, fontWeight: 600 }}>{active}</span> {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
          boxShadow: '0 6px 30px rgba(0,0,0,0.08)', padding: 4, minWidth: 180, zIndex: 30,
        }}>
          {opts.map(([k, label]) => (
            <button key={k} onClick={() => { onChange(k); setOpen(false); }} style={{
              display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
              background: sort === k ? C.surface : 'transparent', border: 'none', borderRadius: 4,
              cursor: 'pointer', fontFamily: SANS, fontSize: 13, color: C.text, fontWeight: sort === k ? 700 : 500,
            }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Search ────────────────────────────────────────────────────────────────

function SearchPanel({ query, onQuery, dateRange, onDateRange }: {
  query: string; onQuery: (q: string) => void;
  dateRange: { from: string; to: string };
  onDateRange: (r: { from: string; to: string }) => void;
}) {
  const [adv, setAdv] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
        <input value={query} onChange={e => onQuery(e.target.value)}
          placeholder="search stories and headlines"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: SERIF, fontSize: 16, fontStyle: query ? 'normal' : 'italic',
            color: query ? C.text : C.muted, padding: '4px 0',
          }}/>
        {query && <button onClick={() => onQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.muted }}>clear</button>}
        <button onClick={() => setAdv(a => !a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 13, color: adv ? C.text : C.dim, fontWeight: adv ? 700 : 500 }}>
          advanced {adv ? '▴' : '▾'}
        </button>
      </div>
      {adv && (
        <div style={{ padding: '18px 0', borderBottom: `1px solid ${C.hairline}`, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px' }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>from</div>
            <input value={dateRange.from} onChange={e => onDateRange({ ...dateRange, from: e.target.value })}
              placeholder="MM-DD-YYYY"
              style={{ width: '100%', border: 'none', borderBottom: `1px solid ${C.border}`, background: 'transparent', fontFamily: SERIF, fontSize: 14, color: C.text, padding: '6px 0', outline: 'none' }}/>
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>to</div>
            <input value={dateRange.to} onChange={e => onDateRange({ ...dateRange, to: e.target.value })}
              placeholder="MM-DD-YYYY"
              style={{ width: '100%', border: 'none', borderBottom: `1px solid ${C.border}`, background: 'transparent', fontFamily: SERIF, fontSize: 14, color: C.text, padding: '6px 0', outline: 'none' }}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Browse list rows ─────────────────────────────────────────────────────

function BrowseListRow({ story, density, expanded, onToggle }: {
  story: Story; density: Density; expanded: boolean; onToggle: () => void;
}) {
  const lms   = latestMs(story);
  const dense = density === 'compact';
  const slug  = story.slug ?? null;
  const latest = story.articles[story.articles.length - 1]?.headline;
  return (
    <div style={{
      borderBottom: `1px solid ${C.hairline}`,
      background: expanded ? C.surface : 'transparent', transition: 'background 100ms ease',
    }}>
      <button onClick={onToggle} aria-expanded={expanded} style={{
        width: '100%', textAlign: 'left',
        padding: dense ? '12px 22px' : '16px 22px',
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'baseline', gap: 16,
      }}>
        <span style={{ minWidth: 100, fontFamily: SERIF, fontSize: 11, fontStyle: 'italic', color: C.dim }}>{story.category}</span>
        <span style={{
          fontFamily: SERIF, fontSize: dense ? 15 : 17, fontWeight: 600,
          color: C.text, lineHeight: 1.3, letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap',
        }}>{story.title}</span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, fontWeight: 500, whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' }}>{relTime(lms)}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 22px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {latest && (
            <p style={{ margin: 0, fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: C.soft, lineHeight: 1.5 }}>
              <span style={{ fontStyle: 'normal', fontWeight: 700, color: C.dim, marginRight: 6 }}>Latest —</span>
              {latest}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontFamily: SANS, fontSize: 12, color: C.muted }}>
            <span>{story.articles.length} article{story.articles.length !== 1 ? 's' : ''}</span>
            <span style={{ flex: 1 }}/>
            {slug && <Link href={`/${slug}`} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.text, textDecoration: 'underline', textUnderlineOffset: 3 }}>read →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function BrowseGridCard({ story }: { story: Story }) {
  const slug   = story.slug ?? null;
  const latest = story.articles[story.articles.length - 1]?.headline;
  return (
    <article style={{ borderTop: `1px solid ${C.hairline}`, padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, fontFamily: SERIF, fontSize: 11, fontStyle: 'italic', color: C.dim }}>
        <span>{story.category}</span>
        <span style={{ color: C.muted }}>·</span>
        <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 11, color: C.muted, letterSpacing: '0.02em' }}>{relTime(latestMs(story))}</span>
      </div>
      <Link href={slug ? `/${slug}` : '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
        <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.18, letterSpacing: '-0.02em' }}>{story.title}</h3>
        {latest && (
          <p style={{ margin: '10px 0 0', fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: C.soft, lineHeight: 1.5 }}>{latest}</p>
        )}
      </Link>
      <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 11, color: C.muted }}>
        {story.articles.length} article{story.articles.length !== 1 ? 's' : ''}
      </div>
    </article>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function BrowseSkeleton() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 24px' }}>
      <style>{`@keyframes vp-sk { 0%,100%{opacity:1}50%{opacity:0.4} } .vp-sk { animation: vp-sk 1.6s ease-in-out infinite; }`}</style>
      <div className="vp-sk" style={{ width: 220, height: 32, background: C.border, borderRadius: 4, marginBottom: 24 }}/>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="vp-sk" style={{ width: '70%', height: 17, background: C.border, borderRadius: 3, marginBottom: 18 }}/>
      ))}
    </div>
  );
}

// ── MM-DD-YYYY parsing ──────────────────────────────────────────────────

function isValidMDY(s: string) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(s)) return false;
  const [m, d, y] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}
function mdyToMs(s: string): number | null {
  if (!isValidMDY(s)) return null;
  const [m, d, y] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// ── Main page ─────────────────────────────────────────────────────────────

function BrowsePageInner() {
  usePageViewTrack('browse');
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [stories,    setStories]    = useState<Story[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeCat,  setActiveCat]  = useState<string | null>(() => searchParams.get('cat') ?? null);
  const [query,      setQuery]      = useState(() => searchParams.get('q') ?? '');
  const [dateFrom,   setDateFrom]   = useState(() => searchParams.get('from') ?? '');
  const [dateTo,     setDateTo]     = useState(() => searchParams.get('to') ?? '');
  const [density,    setDensity]    = useState<Density>('comfortable');
  const [sort,       setSort]       = useState<SortKey>('newest');
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const fetchStories = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStories([]); setLoadFailed(false); setLoading(true);
    loadStories(controller.signal)
      .then(data => { if (controller.signal.aborted) return; setStories(data); setLoading(false); })
      .catch((err) => { if (controller.signal.aborted || err?.name === 'AbortError') return; setLoadFailed(true); setLoading(false); });
  }, []);
  useEffect(() => {
    fetchStories();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchStories]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (activeCat) p.set('cat', activeCat);
    if (query)     p.set('q', query);
    if (dateFrom)  p.set('from', dateFrom);
    if (dateTo)    p.set('to', dateTo);
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [activeCat, query, dateFrom, dateTo, pathname, router]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  const allCats = useMemo(() => {
    const m = new Map<string, number>();
    stories.forEach(s => m.set(s.category, (m.get(s.category) ?? 0) + 1));
    return Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stories]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const visibleStories = useMemo(() => {
    let list = stories;
    if (activeCat) list = list.filter(s => s.category === activeCat);
    const fromMs = mdyToMs(dateFrom);
    const toMs   = mdyToMs(dateTo);
    if (fromMs) list = list.filter(s => latestMs(s) >= fromMs);
    if (toMs)   list = list.filter(s => earliestMs(s) <= toMs);
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q)
        || s.category.toLowerCase().includes(q)
        || s.articles.some(a =>
            a.headline.toLowerCase().includes(q)
            || (a.subtitle ?? '').toLowerCase().includes(q)
            || (a.excerpt ?? '').toLowerCase().includes(q)
          )
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'oldest')        return earliestMs(a) - earliestMs(b);
      if (sort === 'most_articles') return b.articles.length - a.articles.length;
      return latestMs(b) - latestMs(a);
    });
  }, [stories, activeCat, query, sort, dateFrom, dateTo]);

  if (loading) return <BrowseSkeleton />;
  if (loadFailed) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 24 }}>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text }}>couldn&rsquo;t load stories</div>
      <button onClick={fetchStories} style={{ padding: '12px 22px', borderRadius: 10, background: C.text, color: 'var(--p-bg)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: SANS }}>retry</button>
    </div>
  );

  const crumb = activeCat ? activeCat.toLowerCase() : 'all stories';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        button:focus-visible, a:focus-visible { outline: 2px solid var(--p-ink); outline-offset: 2px; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 999px; }
        ::-webkit-scrollbar-track { background: transparent; }

        @media (max-width: 767px) {
          .vp-sidebar {
            position: fixed !important;
            top: var(--vp-top-bar-h, 0px) !important;
            left: 0; bottom: 0;
            z-index: 9500;
            transform: translateX(-100%);
            transition: transform 220ms cubic-bezier(0.25,0,0,1);
            box-shadow: 12px 0 40px rgba(0,0,0,0.18);
          }
          .vp-sidebar.vp-sidebar-open { transform: translateX(0); }
          .vp-sidebar-backdrop { display: block !important; }
          .vp-sidebar-collapse-btn { display: none; }
          .vp-mobile-menu-btn { display: inline-block !important; }
        }
        .vp-mobile-menu-btn { display: none; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileNavOpen}
          onToggle={() => setCollapsed(c => !c)}
          onMobileClose={() => setMobileNavOpen(false)}
          activeCat={activeCat}
          onCat={(c) => { setActiveCat(c); setMobileNavOpen(false); }}
          allCats={allCats}
        />

        <main style={{ flex: 1, minWidth: 0, maxWidth: 980, margin: '0 auto', padding: '0 28px 100px' }}>

          <div style={{ padding: '20px 0 4px', display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <button
              onClick={() => setMobileNavOpen(true)}
              className="vp-mobile-menu-btn"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.text, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              menu
            </button>
            <span style={{ fontFamily: SANS, fontSize: 12, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{crumb}</span>
          </div>

          <header style={{ padding: '14px 0 4px' }}>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 56, fontWeight: 800, color: C.text, lineHeight: 0.95, letterSpacing: '-0.04em' }}>
              {activeCat ?? 'All stories'}
            </h1>
          </header>

          <SearchPanel
            query={query} onQuery={setQuery}
            dateRange={{ from: dateFrom, to: dateTo }}
            onDateRange={r => { setDateFrom(r.from); setDateTo(r.to); }}
          />

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
            <DensityToggle density={density} onChange={setDensity} />
            <span style={{ color: C.muted }}>|</span>
            <SortDropdown sort={sort} onChange={setSort} />
            <span style={{ flex: 1 }}/>
            <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{visibleStories.length} {visibleStories.length === 1 ? 'story' : 'stories'}</span>
          </div>

          {!activeCat && (
            <div style={{ padding: '8px 0' }}>
              <Ad placement="browse_top" page="browse" position="top" />
            </div>
          )}

          {visibleStories.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>nothing here</div>
              <p style={{ fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: C.dim, maxWidth: 360, margin: '0 auto' }}>
                {query || activeCat || dateFrom || dateTo ? 'try a different category or remove a filter.' : 'check back soon.'}
              </p>
            </div>
          ) : density === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 0, marginTop: 8 }}>
              {visibleStories.map(s => <BrowseGridCard key={s.id} story={s} />)}
            </div>
          ) : (
            <section style={{ marginTop: 4 }}>
              {visibleStories.map(s => (
                <BrowseListRow key={s.id} story={s} density={density} expanded={expanded.has(s.id)} onToggle={() => toggleExpand(s.id)} />
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default function BrowsePage() {
  return <Suspense fallback={<BrowseSkeleton />}><BrowsePageInner /></Suspense>;
}
