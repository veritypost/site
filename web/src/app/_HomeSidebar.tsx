// Server-rendered category sidebar for the desktop home. Reads the same
// `categories` rows the rest of the page already fetches; groups them
// into parent + subs and renders a sticky 208px rail. Hidden below the
// 1024px breakpoint via the inline <style> rule so mobile keeps the
// existing single-column layout untouched.

import Link from 'next/link';
import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
} from './_homeShared';

export type SidebarCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number | null;
};

export const HOME_SIDEBAR_BREAKPOINT_PX = 1024;

const sortByOrder = (a: SidebarCategory, b: SidebarCategory) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
};

export default function HomeSidebar({
  categories,
}: {
  categories: SidebarCategory[];
}) {
  // Filter out kids-only rows + the e2e seed. Kids parents that are
  // dual-use (is_kids_safe=true with a `kids-…` slug) get filtered by the
  // slug prefix; adult-eligible parents like World/Science/Technology/
  // Health/Climate stay in.
  const visible = categories.filter(
    (c) => !c.slug.startsWith('kids-') && c.slug !== 'vp-e2e-cat-test',
  );

  const parents = visible.filter((c) => c.parent_id === null).sort(sortByOrder);
  const subsByParent = new Map<string, SidebarCategory[]>();
  visible
    .filter((c) => c.parent_id !== null)
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

        /* Floating-pill scrollbar. Note: scrollbar-color and webkit-
           scrollbar-thumb are not animatable, and macOS Safari with
           overlay scrollbars (the OS default) ignores ::-webkit-scrollbar
           rules entirely — those users see Apple's translucent thumb
           instead. Treated as acceptable: browsers that render our rules
           get a chrome-free idle rail with a soft thumb on hover. */
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
          flexShrink: 0,
          position: 'sticky',
          top: 'var(--vp-top-bar-h, 0px)',
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - var(--vp-top-bar-h, 0px))',
          overflowY: 'auto',
          padding: '24px 18px 32px 0',
          borderRight: '1px solid var(--p-divider, rgba(0,0,0,0.06))',
        }}
      >
        <SidebarSection name="Home" href="/" active />
        {parents.map((p) => (
          <SidebarSection
            key={p.id}
            name={p.name}
            href={`/category/${p.slug}`}
            subs={(subsByParent.get(p.id) ?? []).map((s) => ({
              name: s.name,
              href: `/category/${p.slug}?sub=${s.slug}`,
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
}: {
  name: string;
  href: string;
  subs?: { name: string; href: string }[];
  active?: boolean;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
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
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        {name}
      </Link>
      {subs.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          style={{
            display: 'block',
            textDecoration: 'none',
            fontSize: 12,
            color: C.muted,
            paddingTop: 5,
            paddingBottom: 5,
          }}
        >
          {s.name}
        </Link>
      ))}
    </div>
  );
}
