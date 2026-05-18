'use client';

// Compact filter pill + expanded drawer for the home masthead.
// Replaces the legacy catbar + filter strip nav. Tapping the pill
// opens a popover with three stacked cards (SCOPE / VIEW / TIME).
// Each pick navigates via router.push so back/forward history works
// and the server re-renders the feed with the chosen filters.

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export type FilterCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

type ViewKey =
  | ''
  | 'most_discussed'
  | 'most_viewed'
  | 'new_24h'
  | 'no_discussion'
  | 'questions'
  | 'updated_recently'
  | 'newest_article';

type TimeKey = '' | 'today' | 'this_week' | 'this_month' | 'range';

const VIEW_OPTIONS: Array<{ key: ViewKey; label: string }> = [
  { key: '', label: 'Top Stories' },
  { key: 'most_discussed', label: 'Most Commented' },
  { key: 'most_viewed', label: 'Most Viewed' },
  { key: 'new_24h', label: 'New' },
  { key: 'no_discussion', label: 'No Discussion Yet' },
  { key: 'questions', label: 'Open Questions' },
  { key: 'updated_recently', label: 'Updated Timelines' },
  { key: 'newest_article', label: 'Newest' },
];

const TIME_OPTIONS: Array<{ key: TimeKey; label: string }> = [
  { key: '', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'range', label: 'Date Range' },
];

function labelForView(key: ViewKey | undefined): string {
  return VIEW_OPTIONS.find((o) => o.key === (key ?? ''))?.label ?? 'Top Stories';
}

function labelForTime(
  key: TimeKey | undefined,
  from?: string,
  to?: string,
): string {
  if (key === 'range' || from || to) {
    const fmt = (iso?: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      if (!y || !m || !d) return iso;
      return `${m}/${d}/${y}`;
    };
    return `${fmt(from)} → ${fmt(to)}`.trim();
  }
  return TIME_OPTIONS.find((o) => o.key === (key ?? ''))?.label ?? 'All time';
}

export default function HomeFilterPill({
  categories,
  activeTopic,
  activeView,
  activeTime,
  fromDate,
  toDate,
}: {
  categories: FilterCategory[];
  activeTopic?: string;
  activeView?: ViewKey;
  activeTime?: TimeKey;
  fromDate?: string;
  toDate?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromInput, setFromInput] = useState(fromDate ?? '');
  const [toInput, setToInput] = useState(toDate ?? '');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // SCOPE state — derive top-level + sub from activeTopic.
  const topCats = useMemo(
    () =>
      categories
        .filter((c) => c.parent_id === null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const subsByParent = useMemo(() => {
    const m: Record<string, FilterCategory[]> = {};
    for (const c of categories) {
      if (!c.parent_id) continue;
      (m[c.parent_id] ||= []).push(c);
    }
    return m;
  }, [categories]);

  const activeCat = activeTopic
    ? categories.find((c) => c.slug === activeTopic)
    : undefined;
  const activeParent =
    activeCat && activeCat.parent_id
      ? categories.find((c) => c.id === activeCat.parent_id)
      : activeCat;
  const activeSub =
    activeCat && activeCat.parent_id ? activeCat : undefined;

  const scopeLabel = activeParent
    ? activeSub
      ? `${activeParent.name} → ${activeSub.name}`
      : `${activeParent.name} → All`
    : 'Home';

  const viewLabel = labelForView(activeView);
  const timeLabel = labelForTime(activeTime, fromDate, toDate);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Build a URL from a partial spec. Topic lands on /<slug> when set,
  // otherwise / — matching the live home routing contract.
  function buildUrl(spec: {
    topic?: string | null;
    view?: ViewKey | null;
    time?: TimeKey | null;
    from?: string | null;
    to?: string | null;
  }): string {
    const topic =
      spec.topic === undefined ? activeTopic : spec.topic ?? undefined;
    const view = spec.view === undefined ? activeView : spec.view ?? undefined;
    const time = spec.time === undefined ? activeTime : spec.time ?? undefined;
    const from = spec.from === undefined ? fromDate : spec.from ?? undefined;
    const to = spec.to === undefined ? toDate : spec.to ?? undefined;

    const usp = new URLSearchParams();
    // Presence-only keys (chip / sort / type).
    if (view) usp.append(view, '');
    // Time. 'range' is represented by from/to, not a chip.
    if (time && time !== 'range') usp.append(time, '');
    if (from) usp.set('from', from);
    if (to) usp.set('to', to);
    // Route shape: when no view/time/range is active, use the clean
    // /<topic> slug URL (or / for Home). When a view/time/range is
    // active alongside a topic, fall back to /?topic=<slug>&... so the
    // home page picks both params up — /<slug>/page.tsx doesn't forward
    // searchParams to HomeRoot, so /<slug>?chip would silently drop the
    // chip. Clean URLs stay clean, chip URLs go through the home route.
    const hasChip = usp.size > 0;
    const qs = usp.toString().replace(/=(&|$)/g, '$1');
    if (!topic) return qs ? `/?${qs}` : '/';
    if (!hasChip) return `/${topic}`;
    const u2 = new URLSearchParams();
    u2.set('topic', topic);
    for (const [k, v] of usp.entries()) u2.append(k, v);
    return `/?${u2.toString().replace(/=(&|$)/g, '$1')}`;
  }

  function go(spec: Parameters<typeof buildUrl>[0]) {
    router.push(buildUrl(spec));
  }

  function applyRange() {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const fromOk = !fromInput || re.test(fromInput);
    const toOk = !toInput || re.test(toInput);
    if (!fromOk || !toOk) return;
    // Reset time chip when entering an explicit range.
    router.push(
      buildUrl({
        time: null,
        from: fromInput || null,
        to: toInput || null,
      }),
    );
    setOpen(false);
  }

  const hasActiveSubs = activeParent
    ? (subsByParent[activeParent.id] ?? []).length > 0
    : false;

  return (
    <div className="vp-rh-fpill" ref={wrapRef}>
      <button
        type="button"
        className="vp-rh-fpill__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="vp-rh-fpill__scope">{scopeLabel}</span>
        <span className="vp-rh-fpill__sep" aria-hidden="true">·</span>
        <span className="vp-rh-fpill__view">{viewLabel}</span>
        <span className="vp-rh-fpill__sep" aria-hidden="true">·</span>
        <span className="vp-rh-fpill__time">{timeLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="vp-rh-fpill__caret"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="vp-rh-fpill__drawer" role="dialog" aria-label="Filter feed">
          {/* SCOPE card */}
          <div className="vp-rh-fpill__card">
            <p className="vp-rh-fpill__cardhead">Scope</p>
            <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-cat">
              Category
            </label>
            <select
              id="vp-fpill-cat"
              className="vp-rh-fpill__select"
              value={activeParent?.slug ?? ''}
              onChange={(e) => {
                const slug = e.target.value;
                go({ topic: slug || null });
              }}
            >
              <option value="">Home</option>
              {topCats.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {hasActiveSubs && activeParent && (
              <>
                <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-sub">
                  Subcategory
                </label>
                <select
                  id="vp-fpill-sub"
                  className="vp-rh-fpill__select"
                  value={activeSub?.slug ?? ''}
                  onChange={(e) => {
                    const slug = e.target.value;
                    go({ topic: slug || activeParent.slug });
                  }}
                >
                  <option value="">All</option>
                  {(subsByParent[activeParent.id] ?? []).map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* VIEW card */}
          <div className="vp-rh-fpill__card">
            <p className="vp-rh-fpill__cardhead">View</p>
            <div className="vp-rh-fpill__opts">
              {VIEW_OPTIONS.map((o) => {
                const isActive = (activeView ?? '') === o.key;
                return (
                  <button
                    key={o.key || 'top'}
                    type="button"
                    className={`vp-rh-fpill__opt${isActive ? ' is-active' : ''}`}
                    onClick={() => go({ view: o.key || null })}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TIME card */}
          <div className="vp-rh-fpill__card">
            <p className="vp-rh-fpill__cardhead">Time</p>
            <div className="vp-rh-fpill__opts">
              {TIME_OPTIONS.map((o) => {
                const inRange = !!(fromDate || toDate);
                const isActive =
                  o.key === 'range'
                    ? inRange
                    : !inRange && (activeTime ?? '') === o.key;
                return (
                  <button
                    key={o.key || 'all'}
                    type="button"
                    className={`vp-rh-fpill__opt${isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      if (o.key === 'range') return; // handled by inputs
                      go({
                        time: o.key || null,
                        from: null,
                        to: null,
                      });
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="vp-rh-fpill__range">
              <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-from">
                From
              </label>
              <input
                id="vp-fpill-from"
                type="date"
                className="vp-rh-fpill__date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
              />
              <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-to">
                To
              </label>
              <input
                id="vp-fpill-to"
                type="date"
                className="vp-rh-fpill__date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
              />
              <button
                type="button"
                className="vp-rh-fpill__apply"
                onClick={applyRange}
              >
                Apply range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
