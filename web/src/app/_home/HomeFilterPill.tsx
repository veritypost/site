'use client';

// Compact filter pill + expanded drawer for the home masthead.
// Replaces the legacy catbar + filter strip nav. Tapping the pill
// opens a popover with four stacked cards (SCOPE / VIEW / TIME / SEARCH).
//
// Drawer behavior:
// - Opening the drawer captures the current committed filter state
//   into a local `draft` object. All in-drawer interactions mutate
//   `draft` only — the URL stays put until the user taps Apply.
// - Apply commits the entire `draft` in a single router.push, so the
//   user's flow of "pick category → subcategory → view → time → search"
//   doesn't trigger four page reloads.
// - Closing the drawer (outside-click, Esc, or trigger toggle) without
//   tapping Apply discards the draft entirely.
// - The compact pill label keeps reflecting the COMMITTED (URL) state,
//   not the in-flight draft.

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

type Draft = {
  topicSlug: string; // '' === Home; otherwise parent slug
  subSlug: string;   // '' === All; otherwise sub slug
  view: ViewKey;
  time: TimeKey;
  dateFrom: string;
  dateTo: string;
  q: string;
};

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
  if (from || to) {
    const fmt = (iso?: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      if (!y || !m || !d) return iso;
      return `${m}/${d}/${y}`;
    };
    return `${fmt(from)} → ${fmt(to)}`.trim();
  }
  // 'range' selected but neither date filled in yet — show the label
  // 'Date Range' rather than the empty ' → ' string the formatter
  // would produce.
  if (key === 'range') return 'Date Range';
  return TIME_OPTIONS.find((o) => o.key === (key ?? ''))?.label ?? 'All time';
}

const EMPTY_DRAFT: Draft = {
  topicSlug: '',
  subSlug: '',
  view: '',
  time: '',
  dateFrom: '',
  dateTo: '',
  q: '',
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function HomeFilterPill({
  categories,
  activeTopic,
  activeView,
  activeTime,
  fromDate,
  toDate,
  initialQ,
}: {
  categories: FilterCategory[];
  activeTopic?: string;
  activeView?: ViewKey;
  activeTime?: TimeKey;
  fromDate?: string;
  toDate?: string;
  initialQ?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Inline search query — lives on the pill chrome itself so users
  // can type without opening the drawer. Seeded from URL ?q via the
  // `initialQ` prop. When the drawer is open the SEARCH card mirrors
  // this same state so the in-drawer field and the inline field
  // never diverge.
  const [qInput, setQInput] = useState(initialQ ?? '');
  useEffect(() => {
    setQInput(initialQ ?? '');
  }, [initialQ]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

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
  const catBySlug = useMemo(() => {
    const m: Record<string, FilterCategory> = {};
    for (const c of categories) m[c.slug] = c;
    return m;
  }, [categories]);

  // Committed (URL-derived) labels for the compact pill.
  const activeCat = activeTopic ? catBySlug[activeTopic] : undefined;
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

  // Seed `draft` from committed state + ?q each time the drawer opens.
  // Reset to EMPTY_DRAFT on close so no stale state lingers in memory.
  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_DRAFT);
      return;
    }
    // Resolve parent+sub from activeTopic.
    const cat = activeTopic ? catBySlug[activeTopic] : undefined;
    const parent =
      cat && cat.parent_id
        ? categories.find((c) => c.id === cat.parent_id)
        : cat;
    const sub = cat && cat.parent_id ? cat : undefined;
    // Read ?q from the current URL (client-only; guard SSR).
    let qSeed = '';
    if (typeof window !== 'undefined') {
      const usp = new URLSearchParams(window.location.search);
      qSeed = usp.get('q') ?? '';
    }
    setDraft({
      topicSlug: parent?.slug ?? '',
      subSlug: sub?.slug ?? '',
      view: activeView ?? '',
      time: activeTime ?? (fromDate || toDate ? 'range' : ''),
      dateFrom: fromDate ?? '',
      dateTo: toDate ?? '',
      q: qSeed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click or Escape. Trap Tab so keyboard users can't
  // alt-tab past the open drawer into the page underneath, and lock
  // body scroll on mobile so the page doesn't scroll behind the modal.
  // Both close paths discard the draft (the [open] effect above resets
  // draft when `open` goes false).
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      // Focus trap. Build a list of focusable elements inside the
      // drawer at the moment Tab fires (the conditional Subcategory
      // <select> and the From/To date inputs come and go, so caching
      // this on open isn't safe).
      const FOCUSABLE_SEL =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const nodes = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SEL),
      ).filter((el) => !el.hasAttribute('aria-hidden'));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Cycle: shift+tab from first goes to last; tab from last goes
      // to first. Outside the drawer entirely → snap back to first.
      if (e.shiftKey) {
        if (active === first || !drawerRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !drawerRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // Move focus into the drawer so a keyboard user can't tab past the
    // open dialog to the page beneath it on the very first Tab press.
    // requestAnimationFrame defers until after React paints the drawer.
    const raf = requestAnimationFrame(() => {
      if (!drawerRef.current) return;
      const first = drawerRef.current.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      );
      first?.focus();
    });
    // Lock body scroll while the drawer is open (matters on mobile,
    // where the drawer overlays the feed and the background would
    // otherwise scroll under finger drags).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Build a URL from the draft exclusively. Anything not in draft is
  // dropped (so switching draft.q from "trump" to "" must NOT inherit
  // the prior ?q). Route shape mirrors the legacy logic: when no chip
  // / sort / range is active, use clean /<slug> (or /); otherwise route
  // through /?topic=<slug>&... since /<slug>/page.tsx doesn't forward
  // searchParams to HomeRoot.
  function buildUrlFromDraft(d: Draft): string {
    // Resolve the topic slug we send to the URL: a chosen sub takes
    // priority; else the parent; else nothing.
    const topicForUrl = d.subSlug || d.topicSlug || '';

    const usp = new URLSearchParams();
    // Presence-only view chip.
    if (d.view) usp.append(d.view, '');
    // Time. 'range' is represented by from/to, not a chip.
    if (d.time && d.time !== 'range') usp.append(d.time, '');
    if (d.dateFrom) usp.set('from', d.dateFrom);
    if (d.dateTo) usp.set('to', d.dateTo);
    if (d.q.trim()) usp.set('q', d.q.trim());

    const hasParams = usp.size > 0;
    const qs = usp.toString().replace(/=(&|$)/g, '$1');

    if (!topicForUrl) return qs ? `/?${qs}` : '/';
    if (!hasParams) return `/${topicForUrl}`;
    const u2 = new URLSearchParams();
    u2.set('topic', topicForUrl);
    for (const [k, v] of usp.entries()) u2.append(k, v);
    return `/?${u2.toString().replace(/=(&|$)/g, '$1')}`;
  }

  // Apply gate. Date Range requires BOTH dates valid AND from ≤ to.
  function isApplyDisabled(d: Draft): boolean {
    if (d.time === 'range') {
      if (!d.dateFrom || !d.dateTo) return true;
      if (!ISO_RE.test(d.dateFrom) || !ISO_RE.test(d.dateTo)) return true;
      if (d.dateFrom > d.dateTo) return true;
    }
    return false;
  }

  function commitApply() {
    if (isApplyDisabled(draft)) return;
    // Drawer is open: commit the draft (which carries the user's
    // picked filters), but use the live inline search input as the
    // source of truth for q — so the user can type in either field
    // and the result is the same.
    const url = buildUrlFromDraft({ ...draft, q: qInput });
    setOpen(false); // also clears draft via the [open] effect
    router.push(url);
  }

  // Quick commit path for when the drawer is CLOSED. Combines the
  // currently committed URL filter state (passed in via props) with
  // the typed query, and navigates. Lets the user fire a search
  // without opening the drawer.
  function commitInlineSearch() {
    const usp = new URLSearchParams();
    if (activeView) usp.append(activeView, '');
    if (activeTime && activeTime !== 'range') usp.append(activeTime, '');
    if (fromDate) usp.set('from', fromDate);
    if (toDate) usp.set('to', toDate);
    if (qInput.trim()) usp.set('q', qInput.trim());
    const topicForUrl = activeTopic ?? '';
    const qs = usp.toString().replace(/=(&|$)/g, '$1');
    if (!topicForUrl) {
      router.push(qs ? `/?${qs}` : '/');
      return;
    }
    if (!qs) {
      router.push(`/${topicForUrl}`);
      return;
    }
    const u2 = new URLSearchParams();
    u2.set('topic', topicForUrl);
    for (const [k, v] of usp.entries()) u2.append(k, v);
    router.push(`/?${u2.toString().replace(/=(&|$)/g, '$1')}`);
  }

  function onExploreClick() {
    if (open) {
      commitApply();
    } else {
      commitInlineSearch();
    }
  }

  // Draft mutators.
  function setTopic(slug: string) {
    setDraft((prev) => {
      const cat = slug ? catBySlug[slug] : undefined;
      const hasSubs = cat ? (subsByParent[cat.id] ?? []).length > 0 : false;
      return {
        ...prev,
        topicSlug: slug,
        // Reset sub on parent change. If new parent has no subs, blank it.
        subSlug: hasSubs ? '' : '',
      };
    });
  }

  function setSub(slug: string) {
    setDraft((prev) => ({ ...prev, subSlug: slug }));
  }

  function setView(v: ViewKey) {
    setDraft((prev) => ({ ...prev, view: v }));
  }

  function setTime(t: TimeKey) {
    setDraft((prev) => ({
      ...prev,
      time: t,
      // Leaving 'range' for a chip clears the date inputs; entering
      // 'range' from a chip leaves the (empty) date inputs alone.
      dateFrom: t === 'range' ? prev.dateFrom : '',
      dateTo: t === 'range' ? prev.dateTo : '',
    }));
  }

  function setDateFrom(v: string) {
    setDraft((prev) => ({ ...prev, dateFrom: v, time: 'range' }));
  }
  function setDateTo(v: string) {
    setDraft((prev) => ({ ...prev, dateTo: v, time: 'range' }));
  }
  function setQ(v: string) {
    setDraft((prev) => ({ ...prev, q: v }));
  }

  // Draft-derived view of the SCOPE card.
  const draftParent = draft.topicSlug ? catBySlug[draft.topicSlug] : undefined;
  const draftHasSubs = draftParent
    ? (subsByParent[draftParent.id] ?? []).length > 0
    : false;
  const applyDisabled = isApplyDisabled(draft);

  return (
    <div className="vp-rh-fpill" ref={wrapRef}>
      <div className="vp-rh-fpill__bar" role="group" aria-label="Filter and search">
        <button
          type="button"
          className="vp-rh-fpill__summary"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Open filter drawer"
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
        <span className="vp-rh-fpill__divider" aria-hidden="true" />
        <input
          type="search"
          className="vp-rh-fpill__qinput"
          value={qInput}
          onChange={(e) => {
            const v = e.target.value;
            setQInput(v);
            // Keep draft.q in sync when the drawer is open so the
            // in-drawer field reads the same value the user typed
            // inline.
            if (open) setDraft((prev) => ({ ...prev, q: v }));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onExploreClick();
            }
          }}
          placeholder="Search a topic, person, policy, place, or storyline"
          aria-label="Search query"
        />
        <button
          type="button"
          className="vp-rh-fpill__explore"
          onClick={onExploreClick}
          disabled={open ? applyDisabled : false}
          aria-disabled={open ? applyDisabled : false}
        >
          Explore
        </button>
      </div>

      {open && (
        <div
          className="vp-rh-fpill__drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Filter feed"
          ref={drawerRef}
        >
          {/* SCOPE card */}
          <div className="vp-rh-fpill__card">
            <p className="vp-rh-fpill__cardhead">Scope</p>
            <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-cat">
              Category
            </label>
            <select
              id="vp-fpill-cat"
              className="vp-rh-fpill__select"
              value={draft.topicSlug}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="">Home</option>
              {topCats.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {draftHasSubs && draftParent && (
              <>
                <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-sub">
                  Subcategory
                </label>
                <select
                  id="vp-fpill-sub"
                  className="vp-rh-fpill__select"
                  value={draft.subSlug}
                  onChange={(e) => setSub(e.target.value)}
                >
                  <option value="">All</option>
                  {(subsByParent[draftParent.id] ?? []).map((s) => (
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
                const isActive = draft.view === o.key;
                return (
                  <button
                    key={o.key || 'top'}
                    type="button"
                    className={`vp-rh-fpill__opt${isActive ? ' is-active' : ''}`}
                    onClick={() => setView(o.key)}
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
                const isActive = draft.time === o.key;
                return (
                  <button
                    key={o.key || 'all'}
                    type="button"
                    className={`vp-rh-fpill__opt${isActive ? ' is-active' : ''}`}
                    onClick={() => setTime(o.key)}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {draft.time === 'range' && (() => {
              const dateError =
                !draft.dateFrom || !draft.dateTo
                  ? 'Pick a start and end date.'
                  : draft.dateFrom > draft.dateTo
                    ? 'Start date must be on or before end date.'
                    : '';
              return (
                <div className="vp-rh-fpill__range">
                  <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-from">
                    From
                  </label>
                  <input
                    id="vp-fpill-from"
                    type="date"
                    className="vp-rh-fpill__date"
                    value={draft.dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-invalid={dateError ? 'true' : 'false'}
                    aria-describedby={dateError ? 'vp-fpill-range-err' : undefined}
                  />
                  <label className="vp-rh-fpill__lbl" htmlFor="vp-fpill-to">
                    To
                  </label>
                  <input
                    id="vp-fpill-to"
                    type="date"
                    className="vp-rh-fpill__date"
                    value={draft.dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-invalid={dateError ? 'true' : 'false'}
                    aria-describedby={dateError ? 'vp-fpill-range-err' : undefined}
                  />
                  {dateError && (
                    <p
                      id="vp-fpill-range-err"
                      className="vp-rh-fpill__rangeerr"
                      role="status"
                      aria-live="polite"
                    >
                      {dateError}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* SEARCH card — mobile-only. Desktop has the search input
              on the pill chrome itself; phones don't have room for
              inline search, so the drawer carries the field at that
              size. Spans full drawer width. */}
          <div className="vp-rh-fpill__card vp-rh-fpill__card--full vp-rh-fpill__card--mobile">
            <p className="vp-rh-fpill__cardhead">Search</p>
            <input
              type="search"
              className="vp-rh-fpill__select"
              placeholder="Search a topic, person, policy, place, or storyline"
              value={draft.q}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, q: e.target.value }));
                setQInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitApply();
                }
              }}
            />
          </div>

          {/* In-drawer Explore — mobile-only. The pill's inline Explore
              button is hidden on phones, so the drawer needs its own
              commit affordance. Same handler as the inline button. */}
          <button
            type="button"
            className="vp-rh-fpill__apply vp-rh-fpill__apply--mobile"
            onClick={commitApply}
            disabled={applyDisabled}
            aria-disabled={applyDisabled}
            aria-label="Explore"
          >
            Explore
          </button>
        </div>
      )}
    </div>
  );
}
