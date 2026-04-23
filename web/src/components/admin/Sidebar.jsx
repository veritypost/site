'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Optional left-rail nav for deep-linked admin flows
 * (e.g. stories > story > quiz). Renders a flat list of sections with
 * nested items. Active item matched by pathname prefix.
 *
 * Composes with <Page> — wrap your layout:
 *   <div style={{display:'flex'}}>
 *     <Sidebar items={...} />
 *     <Page>...</Page>
 *   </div>
 *
 * @typedef NavItem
 * @property {string} label
 * @property {string} href
 * @property {React.ReactNode} [icon]
 * @property {NavItem[]} [items]
 *
 * @param {object} props
 * @param {NavItem[]} props.items
 * @param {string} [props.title]
 * @param {number} [props.width=220]
 * @param {object} [props.style]
 */
export default function Sidebar({ items = [], title, width = 220, style }) {
  const pathname = usePathname();
  return (
    <aside
      aria-label={title || 'Admin navigation'}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        minHeight: '100vh',
        background: ADMIN_C.card,
        borderRight: `1px solid ${ADMIN_C.divider}`,
        padding: `${S[6]}px ${S[3]}px`,
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: F.base,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: F.xs,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: ADMIN_C.muted,
            padding: `0 ${S[2]}px ${S[3]}px`,
          }}
        >
          {title}
        </div>
      )}
      <nav>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {items.map((item) => (
            <SidebarItem key={item.href || item.label} item={item} pathname={pathname} depth={0} />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function SidebarItem({ item, pathname, depth }) {
  const active = item.href && (pathname === item.href || pathname?.startsWith(`${item.href}/`));
  const hasKids = Array.isArray(item.items) && item.items.length > 0;

  if (!item.href) {
    return (
      <li>
        <div
          style={{
            padding: `${S[2]}px ${S[2]}px`,
            fontSize: F.xs,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: ADMIN_C.muted,
            marginTop: depth === 0 ? S[2] : 0,
          }}
        >
          {item.label}
        </div>
        {hasKids && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {item.items.map((c) => (
              <SidebarItem key={c.href || c.label} item={c} pathname={pathname} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: S[2],
          padding: `${S[1] + 2}px ${S[2]}px`,
          marginLeft: depth * 12,
          borderRadius: 6,
          textDecoration: 'none',
          color: active ? ADMIN_C.white : ADMIN_C.soft,
          background: active ? ADMIN_C.hover : 'transparent',
          fontWeight: active ? 600 : 500,
          fontSize: F.base,
          lineHeight: 1.4,
          transition: 'background 100ms ease',
          borderLeft: active ? `2px solid ${ADMIN_C.accent}` : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = ADMIN_C.hover;
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent';
        }}
      >
        {item.icon && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              width: 14,
              height: 14,
              alignItems: 'center',
              justifyContent: 'center',
              color: ADMIN_C.dim,
            }}
          >
            {item.icon}
          </span>
        )}
        <span>{item.label}</span>
      </Link>
      {hasKids && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {item.items.map((c) => (
            <SidebarItem key={c.href || c.label} item={c} pathname={pathname} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * @example
 * import Sidebar from '@/components/admin/Sidebar';
 * <div style={{display:'flex'}}>
 *   <Sidebar title="Admin" items={[
 *     { label: 'Content' },
 *     { label: 'Stories', href: '/admin/stories' },
 *     { label: 'Quizzes', href: '/admin/quizzes' },
 *     { label: 'People' },
 *     { label: 'Users', href: '/admin/users' },
 *   ]} />
 *   <Page>{children}</Page>
 * </div>
 */
