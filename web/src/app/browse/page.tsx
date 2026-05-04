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

type Tab     = 'browse' | 'saved' | 'following';
type Density = 'comfortable' | 'compact' | 'grid';
type SortKey = 'newest' | 'oldest' | 'most_articles' | 'recently_active';

interface Article { id: string; date: string; headline: string; slug?: string; source?: string; read?: boolean }
interface Story {
  id: string;
  title: string;
  category: string;
  description?: string;
  articles: Article[];
  slug?: string;
  saved?: { savedAt: number };
  following?: { followedAt: number; newCount: number; lastSeenAt: number };
  publishers?: string[];
  unfinished?: boolean;
}

function latestMs(s: Story)   { return s.articles.length === 0 ? 0 : Math.max(...s.articles.map(a => +new Date(a.date))); }
function earliestMs(s: Story) { return s.articles.length === 0 ? 0 : Math.min(...s.articles.map(a => +new Date(a.date))); }
function durationDays(s: Story) { return Math.round((latestMs(s) - earliestMs(s)) / 86_400_000); }
function relTime(ms: number) {
  const h = (Date.now() - ms) / 3_600_000;
  if (h < 1)   return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24)  return `${Math.round(h)}h ago`;
  if (h < 168) return `${Math.round(h / 24)}d ago`;
  return Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms));
}
function fmtDate(ms: number) { return Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms)); }
function isPersonal(s: Story) { return !!(s.saved || s.following); }

// ── Data ──────────────────────────────────────────────────────────────────

type ClusterRow = {
  id: string; title: string | null; is_active: boolean | null; updated_at: string | null;
  categories: { name: string | null } | null;
  feed_cluster_articles: {
    added_at: string | null;
    articles: { id: string; title: string | null; published_at: string | null; status: string | null; stories: { slug: string } | null } | null;
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
  };
}

async function loadStories(): Promise<Story[]> {
  const supabase = createClient();
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('feed_clusters')
    .select(`
      id, title, is_active, updated_at,
      categories(name),
      feed_cluster_articles(added_at, articles(id, title, published_at, status, stories(slug)))
    `)
    .eq('is_active', true)
    .is('dismissed_at', null)
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(120);
  if (error) throw new Error(error.message);
  if (!data) return [];
  return (data as unknown as ClusterRow[]).map(toStory).filter((s): s is Story => s !== null);
}

const MOCK_PUBLISHERS = ['Reuters', 'AP', 'BBC', 'NYT', 'WaPo', 'Bloomberg', 'FT', 'Guardian', 'Politico', 'Axios'];
function injectMockMeta(stories: Story[]): Story[] {
  return stories.map((story, i) => {
    const next: Story = { ...story };
    if (i % 3 === 0) next.saved = { savedAt: Date.now() - (i + 1) * 86_400_000 * 2 };
    if (i % 4 === 0) next.following = {
      followedAt: Date.now() - (i + 1) * 86_400_000 * 3,
      newCount: i % 7,
      lastSeenAt: Date.now() - (i % 5) * 86_400_000,
    };
    next.publishers  = MOCK_PUBLISHERS.slice(0, 1 + (i % 6));
    next.unfinished  = i % 3 === 1;
    next.description = `Following the ${story.title.toLowerCase()} story across ${1 + (i % 6)} publishers.`;
    // Per-article read state for the timeline strip in story-detail view
    next.articles = next.articles.map((a, ai) => ({
      ...a,
      source: MOCK_PUBLISHERS[ai % MOCK_PUBLISHERS.length],
      read: ai < Math.floor(next.articles.length * 0.65),
    }));
    return next;
  });
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function SideRow({ label, count, active, indent = 0, onClick, hint }: {
  label: string; count?: number | string; active?: boolean; indent?: number;
  onClick: () => void; hint?: string;
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'baseline', gap: 8,
      padding: `7px ${10 + indent}px 7px ${14 + indent}px`,
      background: active ? C.text : 'transparent', borderRadius: 4, border: 'none',
      cursor: 'pointer',
      fontFamily: SANS, fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? 'var(--p-bg)' : C.soft,
      textAlign: 'left', minHeight: 32,
    }}>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: active ? 'var(--p-bg)' : C.faint, fontStyle: 'italic', opacity: 0.7 }}>{hint}</span>}
      {count !== undefined && count !== null && (
        <span style={{ fontSize: 11, color: active ? 'var(--p-bg)' : C.faint, fontWeight: 500, opacity: active ? 0.75 : 1, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
    </button>
  );
}

function SideHeader({ label, action }: { label: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ padding: '14px 14px 6px', display: 'flex', alignItems: 'baseline' }}>
      <span style={{ flex: 1, fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>{label}</span>
      {action && (
        <button onClick={action.onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 10, color: C.muted }}>{action.label}</button>
      )}
    </div>
  );
}

function Sidebar({ collapsed, mobileOpen, onToggle, onMobileClose, tab, onTab, activeCat, onCat, activeStoryId, onStory, allCats, savedCount, followingCount, followedStories, collectionsByName }: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
  tab: Tab; onTab: (t: Tab) => void;
  activeCat: string | null; onCat: (c: string | null) => void;
  activeStoryId: string | null; onStory: (id: string | null) => void;
  allCats: { name: string; count: number }[];
  savedCount: number; followingCount: number;
  followedStories: { id: string; title: string; newCount: number }[];
  collectionsByName: { name: string; count: number }[];
}) {
  // On desktop the sidebar is always visible (collapsed = thin rail, otherwise full).
  // On mobile (<768px) the sidebar is hidden by default and slides in over the page when mobileOpen.
  const baseAside: React.CSSProperties = {
    width: collapsed ? 48 : 232,
    borderRight: `1px solid ${C.hairline}`,
    background: C.bg,
    display: 'flex', flexDirection: 'column',
    position: 'sticky', top: 'var(--vp-top-bar-h, 0px)',
    height: 'calc(100vh - var(--vp-top-bar-h, 0px))',
    flexShrink: 0,
  };
  // We render with two viewport-conditional rules via a className + media-query in the page <style>.
  if (collapsed) {
    return (
      <aside className="vp-sidebar" style={baseAside}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SERIF, fontSize: 22, fontWeight: 800, color: C.text, paddingTop: 18 }}>V</button>
      </aside>
    );
  }
  return (
    <>
      {/* Mobile backdrop (only renders when mobile drawer is open) */}
      {mobileOpen && (
        <div onClick={onMobileClose} style={{
          position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.4)', display: 'none',
        }} className="vp-sidebar-backdrop"/>
      )}
      <aside className={`vp-sidebar ${mobileOpen ? 'vp-sidebar-open' : ''}`} style={baseAside}>
        <div style={{ padding: '18px 14px 12px', display: 'flex', alignItems: 'baseline', borderBottom: `1px solid ${C.hairline}` }}>
          <span style={{ flex: 1, fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Browse</span>
          <button onClick={onToggle} className="vp-sidebar-collapse-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 11, color: C.muted }}>collapse</button>
        </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px 16px' }}>
        <SideHeader label="library" />
        <SideRow label="all stories"  count={undefined} active={tab === 'browse'    && !activeCat && !activeStoryId} onClick={() => { onTab('browse'); onCat(null); onStory(null); }} />
        <SideRow label="saved"        count={savedCount > 0 ? savedCount : undefined}     active={tab === 'saved'} onClick={() => { onTab('saved'); onStory(null); }} />
        <SideRow label="following"    count={followingCount > 0 ? followingCount : undefined} active={tab === 'following' && !activeStoryId} onClick={() => { onTab('following'); onStory(null); }} />

        <SideHeader label="categories" />
        {allCats.map(c => (
          <SideRow key={c.name}
            label={c.name.toLowerCase()}
            count={c.count}
            active={activeCat === c.name}
            onClick={() => { onCat(activeCat === c.name ? null : c.name); onStory(null); }} />
        ))}

        {followedStories.length > 0 && (
          <>
            <SideHeader label="your followed stories" />
            {followedStories.map(s => (
              <SideRow key={s.id}
                label={s.title}
                hint={s.newCount > 0 ? `${s.newCount} new` : undefined}
                active={activeStoryId === s.id}
                onClick={() => { onTab('following'); onStory(s.id); }} />
            ))}
          </>
        )}

        {collectionsByName.length > 0 && (
          <>
            <SideHeader label="collections" />
            {collectionsByName.map(c => (
              <SideRow key={c.name} label={c.name} count={c.count} active={false} onClick={() => { /* mocked */ }} />
            ))}
          </>
        )}
      </div>
      </aside>
    </>
  );
}

// ── Toolbar primitives ────────────────────────────────────────────────────

function TextBtn({ label, active, onClick, sub, italic }: { label: string; active?: boolean; onClick: () => void; sub?: string; italic?: boolean }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      fontFamily: italic ? SERIF : SANS, fontSize: 13,
      fontStyle: italic ? 'italic' : 'normal',
      fontWeight: active ? 700 : 500,
      color: active ? C.text : C.dim,
      textDecoration: active ? 'underline' : 'none',
      textUnderlineOffset: 4, textDecorationThickness: 1.5,
    }}>
      {label}{sub && <span style={{ marginLeft: 4, color: C.muted, fontWeight: 500 }}>({sub})</span>}
    </button>
  );
}

function DensityToggle({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  const opts: [Density, string][] = [['comfortable', 'comfortable'], ['compact', 'compact'], ['grid', 'grid']];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, fontFamily: SANS, fontSize: 12 }}>
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
    ['newest', 'newest first'],
    ['oldest', 'oldest first'],
    ['most_articles', 'most articles'],
    ['recently_active', 'recently active'],
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

// ── Search + Advanced ────────────────────────────────────────────────────

function SearchPanel({ query, onQuery, advanced, onToggleAdvanced }: {
  query: string; onQuery: (q: string) => void;
  advanced: { phrase: string; exclude: string; source: string; date: string };
  onToggleAdvanced: () => void;
}) {
  const [adv, setAdv] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>search</span>
        <input value={query} onChange={e => onQuery(e.target.value)}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: SERIF, fontSize: 16, color: C.text, padding: '4px 0',
          }}/>
        {query && <button onClick={() => onQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.muted }}>clear</button>}
        <button onClick={() => setAdv(a => !a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 13, color: adv ? C.text : C.dim, fontWeight: adv ? 700 : 500 }}>
          advanced {adv ? '▴' : '▾'}
        </button>
      </div>
      {adv && (
        <div style={{ padding: '18px 0', borderBottom: `1px solid ${C.hairline}`, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px' }}>
          {['exact phrase', 'source', 'date range'].map(label => (
            <div key={label}>
              <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>{label}</div>
              <input style={{
                width: '100%', border: 'none', borderBottom: `1px solid ${C.border}`, background: 'transparent',
                fontFamily: SERIF, fontSize: 14, color: C.text, padding: '6px 0', outline: 'none',
              }}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Story-detail timeline strip ──────────────────────────────────────────

function TimelineStrip({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;
  const minT = +new Date(articles[0].date);
  const maxT = +new Date(articles[articles.length - 1].date);
  const range = maxT - minT || 1;
  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 }}>timeline</div>
      <div style={{ position: 'relative', height: 24 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 11, height: 1, background: C.border }}/>
        {articles.map(a => {
          const pct = ((+new Date(a.date) - minT) / range) * 100;
          const isLast = a === articles[articles.length - 1];
          return (
            <div key={a.id} title={`${fmtDate(+new Date(a.date))} — ${a.source ?? ''}`} style={{
              position: 'absolute', top: 5, transform: 'translateX(-50%)',
              left: `${Math.min(Math.max(pct, 1), 99)}%`,
              width: isLast ? 12 : 10, height: isLast ? 12 : 10, borderRadius: '50%',
              background: isLast ? C.text : (a.read ? C.faint : C.text),
              border: isLast ? `3px solid ${C.bg}` : 'none',
              boxShadow: isLast ? `0 0 0 4px ${C.text}33` : 'none',
            }}/>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 10, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 10 }}>
        <span>{fmtDate(minT)}</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.faint, marginRight: 4 }}/>read</span>
          <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.text, marginRight: 4 }}/>unread</span>
        </div>
        <span>today</span>
      </div>
    </div>
  );
}

// ── Article rows in story-detail view ────────────────────────────────────

function ArticleRow({ a, density }: { a: Article; density: Density }) {
  const dense = density === 'compact';
  return (
    <Link href={a.slug ? `/${a.slug}` : '#'} style={{
      textDecoration: 'none', color: 'inherit', display: 'block',
      padding: dense ? '12px 0' : '20px 0',
      borderBottom: `1px solid ${C.hairline}`,
      opacity: a.read ? 0.62 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ minWidth: 76, fontFamily: SANS, fontSize: 11, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {fmtDate(+new Date(a.date))}
        </span>
        {a.source && (
          <span style={{ minWidth: 80, fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: C.dim }}>{a.source}</span>
        )}
        <span style={{ flex: 1, fontFamily: SERIF, fontSize: dense ? 15 : 17, fontWeight: 600, lineHeight: 1.35, color: C.text, letterSpacing: '-0.01em' }}>
          {a.headline}
        </span>
        {!a.read && <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text, whiteSpace: 'nowrap' }}>unread</span>}
      </div>
    </Link>
  );
}

// ── Browse list (the wire / grid for non-story-detail views) ────────────

function BrowseListRow({ story, density, expanded, onToggle, onMutate }: {
  story: Story; density: Density;
  expanded: boolean; onToggle: () => void;
  onMutate: (id: string, patch: Partial<Story>) => void;
}) {
  const lms       = latestMs(story);
  const dur       = durationDays(story);
  const isSaved   = !!story.saved;
  const isFollow  = !!story.following;
  const newCount  = story.following?.newCount ?? 0;
  const personal  = isPersonal(story);
  const dense     = density === 'compact';
  const slug      = story.slug ?? null;
  const toggleSave   = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onMutate(story.id, { saved: isSaved ? undefined : { savedAt: Date.now() } }); };
  const toggleFollow = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onMutate(story.id, { following: isFollow ? undefined : { followedAt: Date.now(), newCount: 0, lastSeenAt: Date.now() } }); };
  return (
    <div style={{
      borderBottom: `1px solid ${C.hairline}`,
      borderLeft: personal ? `2px solid ${C.text}` : '2px solid transparent',
      background: expanded ? C.surface : 'transparent', transition: 'background 100ms ease',
    }}>
      <button onClick={onToggle} aria-expanded={expanded} style={{
        width: '100%', textAlign: 'left',
        padding: dense ? '12px 22px' : '16px 22px',
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'baseline', gap: 16,
      }}>
        <span style={{ minWidth: 100, fontFamily: SERIF, fontSize: 11, fontStyle: 'italic', color: C.dim }}>{story.category}</span>
        <span style={{
          fontFamily: SERIF, fontSize: dense ? 15 : 17, fontWeight: 600,
          color: C.text, lineHeight: 1.3, letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap',
        }}>{story.title}</span>
        {isFollow && newCount > 0 && (
          <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{newCount} new</span>
        )}
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, fontWeight: 500, whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' }}>{relTime(lms)}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 22px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {story.articles.length > 0 && (
            <p style={{ margin: 0, fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: C.soft, lineHeight: 1.5 }}>
              <span style={{ fontStyle: 'normal', fontWeight: 700, color: C.dim, marginRight: 6 }}>Latest —</span>
              {story.articles[story.articles.length - 1].headline}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 14, fontFamily: SANS, fontSize: 12, color: C.muted }}>
            <span>{story.articles.length} article{story.articles.length !== 1 ? 's' : ''}</span>
            {dur > 0 && <span>· {dur} day{dur !== 1 ? 's' : ''}</span>}
            {story.publishers && story.publishers.length > 0 && (
              <span>· {story.publishers.slice(0, 3).join(' · ')}{story.publishers.length > 3 ? ` + ${story.publishers.length - 3} more` : ''}</span>
            )}
            <span style={{ flex: 1 }}/>
            <button onClick={toggleSave} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: isSaved ? C.text : C.muted, fontWeight: isSaved ? 700 : 500 }}>{isSaved ? 'saved' : 'save'}</button>
            <button onClick={toggleFollow} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 12, fontFamily: SANS, fontSize: 12, color: isFollow ? C.text : C.muted, fontWeight: isFollow ? 700 : 500 }}>{isFollow ? 'following' : 'follow'}</button>
            {slug && <Link href={`/${slug}`} style={{ marginLeft: 16, fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.text, textDecoration: 'underline', textUnderlineOffset: 3 }}>read →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function BrowseGridCard({ story, onMutate }: { story: Story; onMutate: (id: string, patch: Partial<Story>) => void }) {
  const isSaved  = !!story.saved;
  const isFollow = !!story.following;
  const personal = isPersonal(story);
  const slug     = story.slug ?? null;
  const newCount = story.following?.newCount ?? 0;
  const toggleSave   = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onMutate(story.id, { saved: isSaved ? undefined : { savedAt: Date.now() } }); };
  const toggleFollow = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onMutate(story.id, { following: isFollow ? undefined : { followedAt: Date.now(), newCount: 0, lastSeenAt: Date.now() } }); };
  return (
    <article style={{
      borderTop: `1px solid ${C.hairline}`, borderLeft: personal ? `2px solid ${C.text}` : '2px solid transparent',
      padding: '22px 22px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, fontFamily: SERIF, fontSize: 11, fontStyle: 'italic', color: C.dim }}>
        <span>{story.category}</span>
        <span style={{ color: C.muted }}>·</span>
        <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 11, color: C.muted, letterSpacing: '0.02em' }}>{relTime(latestMs(story))}</span>
        {isFollow && newCount > 0 && <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: C.text, marginLeft: 'auto' }}>{newCount} new</span>}
      </div>
      <Link href={slug ? `/${slug}` : '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
        <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.18, letterSpacing: '-0.02em' }}>{story.title}</h3>
        {story.articles.length > 0 && (
          <p style={{ margin: '10px 0 0', fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: C.soft, lineHeight: 1.5 }}>
            {story.articles[story.articles.length - 1].headline}
          </p>
        )}
      </Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 16, fontFamily: SANS, fontSize: 11, color: C.muted }}>
        <span>{story.articles.length} articles</span>
        {(story.publishers?.length ?? 0) > 0 && <span>· {story.publishers!.slice(0, 2).join(' · ')}{story.publishers!.length > 2 ? ` + ${story.publishers!.length - 2}` : ''}</span>}
        <span style={{ flex: 1 }}/>
        <button onClick={toggleSave}   style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 11, color: isSaved ? C.text : C.muted, fontWeight: isSaved ? 700 : 500 }}>{isSaved ? 'saved' : 'save'}</button>
        <button onClick={toggleFollow} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 10, fontFamily: SANS, fontSize: 11, color: isFollow ? C.text : C.muted, fontWeight: isFollow ? 700 : 500 }}>{isFollow ? 'following' : 'follow'}</button>
      </div>
    </article>
  );
}

// ── Filter drawer ─────────────────────────────────────────────────────────

interface FilterState {
  date: 'any' | '24h' | '7d' | '30d' | '12mo';
  state: 'any' | 'unread' | 'read' | 'saved';
  sources: string[];
  length: 'any' | 'quick' | 'standard' | 'long';
  hasCorrection: boolean;
  verifiedOnly: boolean;
}
const DEFAULT_FILTERS: FilterState = { date: 'any', state: 'any', sources: [], length: 'any', hasCorrection: false, verifiedOnly: false };

function FilterDrawer({ open, filters, onChange, onClose, allSources, resultCount }: {
  open: boolean; filters: FilterState; onChange: (f: FilterState) => void;
  onClose: () => void; allSources: string[]; resultCount: number;
}) {
  const toggleSource = (src: string) => {
    onChange({ ...filters, sources: filters.sources.includes(src) ? filters.sources.filter(s => s !== src) : [...filters.sources, src] });
  };
  const Group = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text }}>{label}</span>
        {hint && <span style={{ fontFamily: SERIF, fontSize: 11, fontStyle: 'italic', color: C.muted }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
  const Opt = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{
      display: 'flex', width: '100%', padding: '10px 0', alignItems: 'baseline', gap: 10,
      background: 'none', border: 'none', borderBottom: `1px solid ${C.hairline}`, cursor: 'pointer', textAlign: 'left',
      fontFamily: SANS, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.text : C.dim,
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${active ? C.text : C.border}`, background: active ? C.text : 'transparent', flexShrink: 0 }}/>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 180ms ease',
      }}/>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 92vw)', zIndex: 201,
        background: C.bg, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(110%)',
        transition: 'transform 220ms cubic-bezier(0.25,0,0,1)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.10)',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text }}>filters</h2>
          <div style={{ display: 'flex', gap: 18 }}>
            <button onClick={() => onChange(DEFAULT_FILTERS)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.danger }}>reset</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 13, color: C.text, fontWeight: 700 }}>done</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <Group label="date" hint="single select">
            {(['any', '24h', '7d', '30d', '12mo'] as const).map(k => (
              <Opt key={k} label={k === 'any' ? 'any time' : `past ${k === '24h' ? '24 hours' : k === '7d' ? '7 days' : k === '30d' ? '30 days' : '12 months'}`}
                active={filters.date === k} onClick={() => onChange({ ...filters, date: k })}/>
            ))}
          </Group>
          <Group label="reading state">
            {(['any', 'unread', 'read', 'saved'] as const).map(k => (
              <Opt key={k} label={k} active={filters.state === k} onClick={() => onChange({ ...filters, state: k })}/>
            ))}
          </Group>
          <Group label="sources" hint="multi-select">
            {allSources.slice(0, 8).map(src => (
              <Opt key={src} label={src} active={filters.sources.includes(src)} onClick={() => toggleSource(src)}/>
            ))}
          </Group>
          <Group label="length">
            {(['any', 'quick', 'standard', 'long'] as const).map(k => (
              <Opt key={k} label={k === 'any' ? 'any length' : k === 'quick' ? 'quick (under 4 min)' : k === 'standard' ? 'standard (4–10 min)' : 'long-form (10+ min)'}
                active={filters.length === k} onClick={() => onChange({ ...filters, length: k })}/>
            ))}
          </Group>
          <Group label="quality">
            <Opt label="verified only"  active={filters.verifiedOnly}  onClick={() => onChange({ ...filters, verifiedOnly: !filters.verifiedOnly })}/>
            <Opt label="has correction" active={filters.hasCorrection} onClick={() => onChange({ ...filters, hasCorrection: !filters.hasCorrection })}/>
          </Group>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.hairline}` }}>
          <button onClick={onClose} style={{
            width: '100%', padding: '14px', borderRadius: 10,
            background: C.text, color: 'var(--p-bg)', border: 'none', cursor: 'pointer',
            fontFamily: SANS, fontSize: 14, fontWeight: 700,
          }}>show {resultCount} {resultCount === 1 ? 'result' : 'results'}</button>
        </div>
      </div>
    </>
  );
}

function ActiveFilterChips({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  const items: { label: string; clear: () => void }[] = [];
  if (filters.date !== 'any')   items.push({ label: filters.date === '24h' ? 'past 24h' : filters.date === '7d' ? 'past 7d' : filters.date === '30d' ? 'past 30d' : 'past 12mo', clear: () => onChange({ ...filters, date: 'any' }) });
  if (filters.state !== 'any')  items.push({ label: filters.state, clear: () => onChange({ ...filters, state: 'any' }) });
  filters.sources.forEach(src => items.push({ label: src, clear: () => onChange({ ...filters, sources: filters.sources.filter(s => s !== src) }) }));
  if (filters.length !== 'any') items.push({ label: `${filters.length} read`, clear: () => onChange({ ...filters, length: 'any' }) });
  if (filters.verifiedOnly)     items.push({ label: 'verified', clear: () => onChange({ ...filters, verifiedOnly: false }) });
  if (filters.hasCorrection)    items.push({ label: 'has correction', clear: () => onChange({ ...filters, hasCorrection: false }) });
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0' }}>
      {items.map((it, i) => (
        <button key={i} onClick={it.clear} style={{
          padding: '5px 10px 5px 12px',
          background: C.text, color: 'var(--p-bg)', border: 'none', borderRadius: 16,
          fontFamily: SANS, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>{it.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>×</span></button>
      ))}
      <button onClick={() => items.forEach(it => it.clear())} style={{
        background: 'none', border: 'none', padding: '5px 10px', cursor: 'pointer',
        fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: C.danger,
      }}>clear all</button>
    </div>
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

// ── Main page ─────────────────────────────────────────────────────────────

function BrowsePageInner() {
  usePageViewTrack('browse');
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [stories,    setStories]    = useState<Story[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tab,        setTab]        = useState<Tab>(() => {
    const t = searchParams.get('tab');
    return t === 'saved' ? 'saved' : t === 'following' ? 'following' : 'browse';
  });
  const [activeCat,  setActiveCat]  = useState<string | null>(() => searchParams.get('cat') ?? null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(() => searchParams.get('story') ?? null);
  const [query,      setQuery]      = useState(() => searchParams.get('q') ?? '');
  const [density,    setDensity]    = useState<Density>('comfortable');
  const [sort,       setSort]       = useState<SortKey>('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters,    setFilters]    = useState<FilterState>(DEFAULT_FILTERS);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const fetchStories = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStories([]); setLoadFailed(false); setLoading(true);
    loadStories()
      .then(data => { if (controller.signal.aborted) return; setStories(injectMockMeta(data)); setLoading(false); })
      .catch(() => { if (controller.signal.aborted) return; setLoadFailed(true); setLoading(false); });
  }, []);
  useEffect(() => { fetchStories(); }, [fetchStories]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== 'browse')           p.set('tab', tab);
    if (activeCat)                  p.set('cat', activeCat);
    if (activeStoryId)              p.set('story', activeStoryId);
    if (query)                      p.set('q', query);
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [tab, activeCat, activeStoryId, query, pathname, router]);

  const allCats = useMemo(() => {
    const m = new Map<string, number>();
    stories.forEach(s => m.set(s.category, (m.get(s.category) ?? 0) + 1));
    return Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stories]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    stories.forEach(s => s.publishers?.forEach(p => set.add(p)));
    return Array.from(set).sort();
  }, [stories]);

  const followedStories = useMemo(() =>
    stories.filter(s => s.following).map(s => ({ id: s.id, title: s.title, newCount: s.following!.newCount })),
  [stories]);

  const savedCount     = useMemo(() => stories.filter(s => s.saved).length, [stories]);
  const followingCount = useMemo(() => stories.filter(s => s.following).length, [stories]);

  const collectionsByName = useMemo(() => [
    { name: 'weekend reading',      count: 14 },
    { name: 'background research',  count: 31 },
  ], []);

  const handleMutate = useCallback((id: string, patch: Partial<Story>) => {
    setStories(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);
  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const visibleStories = useMemo(() => {
    let list = stories;
    if (tab === 'saved')      list = list.filter(s => s.saved);
    if (tab === 'following')  list = list.filter(s => s.following);
    if (activeCat)            list = list.filter(s => s.category === activeCat);
    if (filters.state === 'unread') list = list.filter(s => s.unfinished);
    if (filters.state === 'read')   list = list.filter(s => !s.unfinished);
    if (filters.state === 'saved')  list = list.filter(s => s.saved);
    if (filters.sources.length > 0) list = list.filter(s => (s.publishers ?? []).some(p => filters.sources.includes(p)));
    if (filters.date !== 'any') {
      const ranges = { '24h': 1, '7d': 7, '30d': 30, '12mo': 365 } as const;
      const days = ranges[filters.date];
      const cutoff = Date.now() - days * 86_400_000;
      list = list.filter(s => latestMs(s) >= cutoff);
    }
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q)
        || s.category.toLowerCase().includes(q)
        || s.articles.some(a => a.headline.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'oldest')          return earliestMs(a) - earliestMs(b);
      if (sort === 'most_articles')   return b.articles.length - a.articles.length;
      if (sort === 'recently_active') return latestMs(b) - latestMs(a);
      return latestMs(b) - latestMs(a);
    });
  }, [stories, tab, activeCat, filters, query, sort]);

  const activeStory = useMemo(() => stories.find(s => s.id === activeStoryId) ?? null, [stories, activeStoryId]);

  if (loading) return <BrowseSkeleton />;
  if (loadFailed) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 24 }}>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text }}>couldn&rsquo;t load stories</div>
      <button onClick={fetchStories} style={{ padding: '12px 22px', borderRadius: 10, background: C.text, color: 'var(--p-bg)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: SANS }}>retry</button>
    </div>
  );

  // Breadcrumb
  const crumb = activeStory
    ? `following › ${activeStory.title.toLowerCase()}`
    : tab === 'saved' ? 'saved'
    : tab === 'following' ? 'following'
    : activeCat ? activeCat.toLowerCase()
    : 'all stories';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        button:focus-visible, a:focus-visible { outline: 2px solid var(--p-ink); outline-offset: 2px; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 999px; }
        ::-webkit-scrollbar-track { background: transparent; }

        /* Sidebar responsive: shown on desktop, slides in on mobile */
        @media (max-width: 767px) {
          .vp-sidebar {
            position: fixed !important;
            top: var(--vp-top-bar-h, 0px) !important;
            left: 0; bottom: 0;
            z-index: 120;
            transform: translateX(-100%);
            transition: transform 220ms cubic-bezier(0.25,0,0,1);
            box-shadow: 12px 0 40px rgba(0,0,0,0.18);
          }
          .vp-sidebar.vp-sidebar-open {
            transform: translateX(0);
          }
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
          tab={tab} onTab={(t) => { setTab(t); setMobileNavOpen(false); }}
          activeCat={activeCat} onCat={(c) => { setActiveCat(c); setMobileNavOpen(false); }}
          activeStoryId={activeStoryId} onStory={(id) => { setActiveStoryId(id); setMobileNavOpen(false); }}
          allCats={allCats}
          savedCount={savedCount}
          followingCount={followingCount}
          followedStories={followedStories}
          collectionsByName={collectionsByName}
        />

        <main style={{ flex: 1, minWidth: 0, maxWidth: 980, margin: '0 auto', padding: '0 28px 100px' }}>

          {/* Breadcrumb + mobile menu trigger */}
          <div style={{ padding: '20px 0 4px', display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <button
              onClick={() => setMobileNavOpen(true)}
              className="vp-mobile-menu-btn"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.text, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              menu
            </button>
            <span style={{ fontFamily: SANS, fontSize: 12, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{crumb}</span>
          </div>

          {/* Page title or story header */}
          {activeStory ? (
            <header style={{ padding: '16px 0 8px' }}>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 40, fontWeight: 800, color: C.text, lineHeight: 1.05, letterSpacing: '-0.03em' }}>{activeStory.title}</h1>
              {activeStory.description && (
                <p style={{ margin: '14px 0 0', fontFamily: SERIF, fontSize: 16, fontStyle: 'italic', lineHeight: 1.55, color: C.dim, maxWidth: 620 }}>
                  {activeStory.description}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 18, fontFamily: SANS, fontSize: 12, color: C.muted, letterSpacing: '0.02em' }}>
                <span><strong style={{ color: C.text, fontWeight: 700 }}>{activeStory.articles.length}</strong> articles</span>
                <span>started <strong style={{ color: C.text, fontWeight: 700 }}>{durationDays(activeStory)} days</strong> ago</span>
                <span><strong style={{ color: C.text, fontWeight: 700 }}>{activeStory.publishers?.length ?? 0}</strong> sources</span>
                <span>read <strong style={{ color: C.text, fontWeight: 700 }}>{activeStory.articles.filter(a => a.read).length}</strong>/<strong style={{ color: C.text, fontWeight: 700 }}>{activeStory.articles.length}</strong></span>
                {activeStory.following && activeStory.following.newCount > 0 && (
                  <span style={{ color: C.text, fontWeight: 700 }}>{activeStory.following.newCount} new since you were last here</span>
                )}
                <span style={{ flex: 1 }}/>
                <button onClick={() => handleMutate(activeStory.id, { following: undefined })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.danger, fontStyle: 'italic' }}>unfollow</button>
              </div>
              <TimelineStrip articles={activeStory.articles} />
            </header>
          ) : (
            <header style={{ padding: '14px 0 4px' }}>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 56, fontWeight: 800, color: C.text, lineHeight: 0.95, letterSpacing: '-0.04em' }}>
                {tab === 'saved' ? 'Saved' : tab === 'following' ? 'Following' : activeCat ?? 'All stories'}
              </h1>
            </header>
          )}

          {/* Search + Advanced */}
          <SearchPanel query={query} onQuery={setQuery} advanced={{ phrase: '', exclude: '', source: '', date: '' }} onToggleAdvanced={() => {}} />

          {/* Toolbar */}
          {!activeStory && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
              <DensityToggle density={density} onChange={setDensity} />
              <span style={{ color: C.muted }}>|</span>
              <SortDropdown sort={sort} onChange={setSort} />
              <span style={{ color: C.muted }}>|</span>
              <button onClick={() => setFilterOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 12, color: C.dim }}>
                filter{(filters.state !== 'any' || filters.date !== 'any' || filters.sources.length > 0 || filters.length !== 'any' || filters.verifiedOnly || filters.hasCorrection) && <span style={{ marginLeft: 4, color: C.text, fontWeight: 700 }}>· active</span>}
              </button>
              <span style={{ flex: 1 }}/>
              <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{visibleStories.length} {visibleStories.length === 1 ? 'story' : 'stories'}</span>
            </div>
          )}

          {!activeStory && <ActiveFilterChips filters={filters} onChange={setFilters} />}

          {/* Ad slot — only on the default all-stories view, before the feed renders */}
          {!activeStory && tab === 'browse' && !activeCat && (
            <div style={{ padding: '8px 0' }}>
              <Ad placement="browse_top" page="browse" position="top" />
            </div>
          )}

          {/* Body */}
          {activeStory ? (
            <section style={{ padding: '16px 0 0' }}>
              <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 }}>
                articles in this story
              </div>
              {activeStory.articles.slice().reverse().map(a => (
                <ArticleRow key={a.id} a={a} density={density} />
              ))}
            </section>
          ) : visibleStories.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>nothing here yet</div>
              <p style={{ fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: C.dim, maxWidth: 360, margin: '0 auto' }}>
                {tab === 'following' ? 'tap follow on any story to start tracking it.' : tab === 'saved' ? 'tap save on any story to fill this view.' : 'try a different category or remove a filter.'}
              </p>
            </div>
          ) : density === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 0, marginTop: 8 }}>
              {visibleStories.map(s => <BrowseGridCard key={s.id} story={s} onMutate={handleMutate} />)}
            </div>
          ) : (
            <section style={{ marginTop: 4 }}>
              {visibleStories.map(s => (
                <BrowseListRow key={s.id} story={s} density={density} expanded={expanded.has(s.id)} onToggle={() => toggleExpand(s.id)} onMutate={handleMutate} />
              ))}
            </section>
          )}
        </main>
      </div>

      <FilterDrawer
        open={filterOpen} filters={filters}
        onChange={setFilters} onClose={() => setFilterOpen(false)}
        allSources={allSources} resultCount={visibleStories.length}
      />
    </div>
  );
}

export default function BrowsePage() {
  return <Suspense fallback={<BrowseSkeleton />}><BrowsePageInner /></Suspense>;
}
