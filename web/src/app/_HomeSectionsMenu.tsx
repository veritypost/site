'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { Z } from '@/lib/zIndex';

import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
} from './_homeShared';
import { HOME_SIDEBAR_BREAKPOINT_PX, type SidebarCategory } from './_HomeSidebar';

const OVERLAY_ID = 'vp-home-sections-overlay';
const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const sortByOrder = (a: SidebarCategory, b: SidebarCategory) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
};

export default function HomeSectionsMenu() {
  const searchParams = useSearchParams();
  const activeCatSlug = searchParams?.get('cat') || null;
  const activeSubSlug = searchParams?.get('sub') || null;
  const isHomeActive = !activeCatSlug && !activeSubSlug;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<SidebarCategory[] | null>(null);
  const [mounted, setMounted] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Eager fetch — data ready before the first open. React 18 strict mode
  // runs this twice in dev; the cancelled flag ensures only the surviving
  // mount's response lands in state.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/categories', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: { categories?: SidebarCategory[] }) => {
        if (cancelled) return;
        setCategories(Array.isArray(body.categories) ? body.categories : []);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () =>
      (categories ?? []).filter(
        (c) => !c.slug.startsWith('kids-') && c.slug !== 'vp-e2e-cat-test',
      ),
    [categories],
  );
  const parents = useMemo(
    () => visible.filter((c) => c.parent_id === null).sort(sortByOrder),
    [visible],
  );
  const subsByParent = useMemo(() => {
    const map = new Map<string, SidebarCategory[]>();
    visible
      .filter((c) => c.parent_id !== null)
      .forEach((c) => {
        const list = map.get(c.parent_id as string) ?? [];
        list.push(c);
        map.set(c.parent_id as string, list);
      });
    map.forEach((list) => list.sort(sortByOrder));
    return map;
  }, [visible]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setExpanded(new Set());
      return;
    }
    if (activeCatSlug) {
      const match = parents.find((p) => p.slug === activeCatSlug);
      if (match) setExpanded(new Set([match.id]));
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // Defaults computed once at open; URL changes mid-session shouldn't
    // re-snap expansion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searching = query.trim().length > 0;

  return (
    <>
      <style>{`
        .vp-home-sections-menu-trigger { display: inline-flex; }
        @media (min-width: ${HOME_SIDEBAR_BREAKPOINT_PX}px) {
          .vp-home-sections-menu-trigger { display: none !important; }
          .vp-home-sections-overlay-root { display: none !important; }
        }
        @media print {
          .vp-home-sections-menu-trigger { display: none !important; }
          .vp-home-sections-overlay-root { display: none !important; }
        }
        @keyframes vp-sections-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .vp-home-sections-overlay {
          animation: vp-sections-overlay-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .vp-home-sections-search::placeholder {
          font-family: ${serifStack};
          font-style: italic;
          color: ${C.dim};
        }
        @media (prefers-reduced-motion: reduce) {
          .vp-home-sections-overlay { animation: none; }
        }
      `}</style>
      <button
        type="button"
        className="vp-home-sections-menu-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={OVERLAY_ID}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '4px 8px',
          fontFamily: serifStack,
          fontStyle: 'italic',
          fontSize: 14,
          color: C.text,
          cursor: 'pointer',
        }}
      >
        index
      </button>
      {open && mounted && createPortal(
        <div className="vp-home-sections-overlay-root">
          <div
            id={OVERLAY_ID}
            role="dialog"
            aria-modal="true"
            aria-label="Browse sections"
            className="vp-home-sections-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: Z.CRITICAL,
              background: 'var(--bg)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header
              style={{
                flexShrink: 0,
                height: 60,
                padding: '0 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${C.rule}`,
              }}
            >
              <span
                style={{
                  fontFamily: serifStack,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: C.text,
                }}
              >
                veritypost
              </span>
              <button
                type="button"
                onClick={close}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 8px',
                  fontFamily: serifStack,
                  fontStyle: 'italic',
                  fontSize: 14,
                  color: C.text,
                  cursor: 'pointer',
                }}
              >
                close
              </button>
            </header>

            <div style={{ flexShrink: 0, padding: '20px 22px 0' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search the record"
                aria-label="Search the record"
                className="vp-home-sections-search"
                style={{
                  width: '100%',
                  height: 44,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${C.rule}`,
                  outline: 'none',
                  fontFamily: serifStack,
                  fontSize: 20,
                  color: C.text,
                  padding: '0 0 10px',
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 60px' }}>
              {searching ? (
                <p
                  style={{
                    fontFamily: serifStack,
                    fontStyle: 'italic',
                    fontSize: 15,
                    color: C.muted,
                    margin: '8px 0 0',
                  }}
                >
                  Search lands in the next pass.
                </p>
              ) : (
                <>
                  {categories === null && (
                    <div
                      style={{
                        fontFamily: serifStack,
                        fontSize: 13,
                        color: C.muted,
                        padding: '12px 0',
                      }}
                    >
                      Loading sections…
                    </div>
                  )}

                  <FollowingRow
                    expanded={expanded.has('__following__')}
                    onToggle={() => toggle('__following__')}
                  />

                  <AllRow active={isHomeActive} onNavigate={close} />

                  {parents.map((p, i) => {
                    const subs = subsByParent.get(p.id) ?? [];
                    const parentActive = activeCatSlug === p.slug;
                    return (
                      <CategoryRow
                        key={p.id}
                        name={p.name}
                        slug={p.slug}
                        index={String(i + 1).padStart(2, '0')}
                        expanded={expanded.has(p.id)}
                        parentActive={parentActive}
                        activeSubSlug={parentActive ? activeSubSlug : null}
                        subs={subs.map((s) => ({ name: s.name, slug: s.slug }))}
                        onToggle={() => toggle(p.id)}
                        onNavigate={close}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function FollowingRow({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '16px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontFamily: serifStack,
            fontSize: 22,
            fontWeight: expanded ? 600 : 500,
            color: C.text,
            letterSpacing: '-0.015em',
          }}
        >
          Following
        </span>
      </button>
      {expanded && (
        <div
          style={{
            paddingLeft: 14,
            marginLeft: 2,
            paddingBottom: 16,
            borderLeft: `1px solid ${C.rule}`,
          }}
        >
          <p
            style={{
              fontFamily: serifStack,
              fontStyle: 'italic',
              fontSize: 14,
              color: C.muted,
              margin: 0,
              padding: '2px 0',
            }}
          >
            No followed sections yet.
          </p>
        </div>
      )}
    </div>
  );
}

function AllRow({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}` }}>
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '16px 0',
          textDecoration: 'none',
        }}
      >
        <span
          style={{
            fontFamily: serifStack,
            fontSize: 22,
            fontWeight: active ? 600 : 500,
            letterSpacing: '-0.015em',
            color: C.text,
          }}
        >
          Home
        </span>
        <span
          style={{
            fontFamily: MONO_STACK,
            fontSize: 10,
            color: C.dim,
            letterSpacing: '0.05em',
          }}
        >
          00
        </span>
      </Link>
    </div>
  );
}

function CategoryRow({
  name,
  slug,
  index,
  expanded,
  parentActive,
  activeSubSlug,
  subs,
  onToggle,
  onNavigate,
}: {
  name: string;
  slug: string;
  index: string;
  expanded: boolean;
  parentActive: boolean;
  activeSubSlug: string | null;
  subs: { name: string; slug: string }[];
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasSubs = subs.length > 0;
  const rowChildren = (
    <>
      <span
        style={{
          fontFamily: serifStack,
          fontSize: 22,
          fontWeight: expanded || parentActive ? 600 : 500,
          color: C.text,
          letterSpacing: '-0.015em',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: MONO_STACK,
          fontSize: 10,
          color: C.dim,
          letterSpacing: '0.05em',
        }}
      >
        {index}
      </span>
    </>
  );
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}` }}>
      {hasSubs ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            padding: '16px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            textAlign: 'left',
          }}
        >
          {rowChildren}
        </button>
      ) : (
        <Link
          href={`/?cat=${slug}`}
          onClick={onNavigate}
          aria-current={parentActive && !activeSubSlug ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '16px 0',
            textDecoration: 'none',
          }}
        >
          {rowChildren}
        </Link>
      )}
      {hasSubs && expanded && (
        <div
          style={{
            paddingLeft: 14,
            marginLeft: 2,
            paddingBottom: 16,
            borderLeft: `1px solid ${C.rule}`,
            display: 'grid',
            gap: 10,
          }}
        >
          {subs.map((s) => {
            const subActive = s.slug === activeSubSlug;
            return (
              <Link
                key={s.slug}
                href={`/?cat=${slug}&sub=${s.slug}`}
                onClick={onNavigate}
                aria-current={subActive ? 'page' : undefined}
                style={{
                  fontSize: 14,
                  fontWeight: subActive ? 600 : 400,
                  color: subActive ? C.text : C.muted,
                  textDecoration: 'none',
                  padding: '2px 0',
                }}
              >
                {s.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
