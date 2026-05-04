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
      `}</style>
      <aside
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
          borderRight: `1px solid ${C.rule}`,
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
      </aside>
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
      {subs.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          style={{
            display: 'block',
            textDecoration: 'none',
            fontSize: 12,
            color: C.muted,
            marginTop: 6,
          }}
        >
          {s.name}
        </Link>
      ))}
    </div>
  );
}
