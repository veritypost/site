'use client';

// Category sidebar for the desktop home. Reads the same `categories` rows
// the rest of the page already fetches; groups them into parent + subs and
// renders a fixed 208px rail pinned to the viewport's left edge so the feed
// below stays viewport-centered. Hidden below 1280px so the centered 880px
// feed never collides with the rail.
//
// Subs always render under their parent — no chevron, no collapse.

import Link from 'next/link';
import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
} from './_shared';

export type SidebarCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number | null;
};

export const HOME_SIDEBAR_BREAKPOINT_PX = 1280;

const sortByOrder = (a: SidebarCategory, b: SidebarCategory) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
};

export default function Sidebar({
  categories,
  activeCatSlug = null,
  activeSubSlug = null,
  viewerIsAdmin = false,
  populatedSubIds = [],
}: {
  categories: SidebarCategory[];
  activeCatSlug?: string | null;
  activeSubSlug?: string | null;
  // Wave E — admin viewers see every subcategory (including empty ones);
  // non-admin viewers see only subs whose id is in `populatedSubIds`.
  // Parents (top-level categories) always render either way.
  viewerIsAdmin?: boolean;
  populatedSubIds?: string[];
}) {
  const isHomeActive = !activeCatSlug && !activeSubSlug;
  const populatedSet = new Set(populatedSubIds);
  const visible = categories.filter(
    (c) => !c.slug.startsWith('kids-') && c.slug !== 'vp-e2e-cat-test',
  );

  const parents = visible.filter((c) => c.parent_id === null).sort(sortByOrder);
  const subsByParent = new Map<string, SidebarCategory[]>();
  visible
    .filter((c) => c.parent_id !== null)
    // Wave E — hide empty subs from non-admin viewers. Admin sees all.
    .filter((c) => viewerIsAdmin || populatedSet.has(c.id))
    .forEach((c) => {
      const list = subsByParent.get(c.parent_id as string) ?? [];
      list.push(c);
      subsByParent.set(c.parent_id as string, list);
    });
  subsByParent.forEach((list) => list.sort(sortByOrder));

  return (
    <>
      <style>{`
        @media (max-width: ${HOME_SIDEBAR_BREAKPOINT_PX - 1}px) {
          .vp-home-sidebar { display: none !important; }
        }
        @media print {
          .vp-home-sidebar { display: none !important; }
        }

        .vp-home-sidebar {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }
        .vp-home-sidebar:hover,
        .vp-home-sidebar:focus-within {
          scrollbar-color: var(--p-border-strong, rgba(0,0,0,0.18)) transparent;
        }
        .vp-home-sidebar::-webkit-scrollbar { width: 10px; height: 10px; }
        .vp-home-sidebar::-webkit-scrollbar-track { background: transparent; }
        .vp-home-sidebar::-webkit-scrollbar-thumb {
          background-color: transparent;
          background-clip: content-box;
          border: 3px solid transparent;
          border-radius: 999px;
          min-height: 32px;
        }
        .vp-home-sidebar:hover::-webkit-scrollbar-thumb,
        .vp-home-sidebar:focus-within::-webkit-scrollbar-thumb {
          background-color: var(--p-border-strong, rgba(0,0,0,0.18));
        }
        .vp-home-sidebar::-webkit-scrollbar-thumb:hover {
          background-color: var(--p-ink-faint, rgba(0,0,0,0.32));
        }
        .vp-home-sidebar::-webkit-scrollbar-thumb:active {
          background-color: var(--p-ink-dim, rgba(0,0,0,0.45));
        }

        .vp-home-sidebar a { transition: color 160ms ease-out; outline: none; }
        .vp-home-sidebar a:hover { color: var(--p-ink) !important; }
        .vp-home-sidebar a:focus-visible {
          outline: 2px solid var(--p-ink);
          outline-offset: 2px;
          border-radius: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .vp-home-sidebar a { transition: none; }
        }
      `}</style>
      <nav
        className="vp-home-sidebar"
        aria-label="Sections"
        style={{
          width: 208,
          position: 'fixed',
          left: 16,
          top: 'var(--vp-top-bar-h, 0px)',
          maxHeight: 'calc(100vh - var(--vp-top-bar-h, 0px))',
          overflowY: 'auto',
          padding: '24px 18px 32px 0',
        }}
      >
        <SidebarSection name="Home" href="/" active={isHomeActive} />
        {parents.map((p) => (
          <SidebarSection
            key={p.id}
            name={p.name}
            href={`/?cat=${p.slug}`}
            active={activeCatSlug === p.slug && !activeSubSlug}
            activeSubSlug={activeCatSlug === p.slug ? activeSubSlug : null}
            subs={(subsByParent.get(p.id) ?? []).map((s) => ({
              name: s.name,
              href: `/?cat=${p.slug}&sub=${s.slug}`,
              slug: s.slug,
            }))}
          />
        ))}
      </nav>
    </>
  );
}

function SidebarSection({
  name,
  href,
  subs = [],
  active = false,
  activeSubSlug = null,
}: {
  name: string;
  href: string;
  subs?: { name: string; href: string; slug?: string }[];
  active?: boolean;
  activeSubSlug?: string | null;
}) {
  const hasSubs = subs.length > 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'block',
            textDecoration: 'none',
            fontFamily: serifStack,
            fontSize: 15,
            fontWeight: active ? 700 : 600,
            color: active ? C.text : C.soft,
            letterSpacing: '-0.005em',
          }}
        >
          {name}
        </Link>
      </div>
      {hasSubs && (
        <div style={{ paddingLeft: 2 }}>
          {subs.map((s) => {
            const subActive = !!s.slug && s.slug === activeSubSlug;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={subActive ? 'page' : undefined}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: subActive ? 700 : 400,
                  color: subActive ? C.text : C.muted,
                  paddingTop: 5,
                  paddingBottom: 5,
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
