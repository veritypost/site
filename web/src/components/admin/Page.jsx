// @admin-verified 2026-04-23
'use client';

import Link from 'next/link';
import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Outer admin page layout. Centers content, caps width, provides
 * padding, and owns the page-level font stack.
 *
 * Usage pattern:
 *   <Page>
 *     <PageHeader title="Stories" subtitle="All published stories" actions={...} />
 *     <PageSection title="Filters">...</PageSection>
 *     <PageSection title="Results">...</PageSection>
 *   </Page>
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {number|string} [props.maxWidth=1280]
 * @param {object} [props.style]
 */
export default function Page({ children, maxWidth = 1280, style }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: ADMIN_C.bg,
        color: ADMIN_C.white,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: F.base,
        lineHeight: 1.5,
        ...style,
      }}
    >
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          padding: `${S[6]}px ${S[6]}px ${S[12]}px`,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Page header — breadcrumb, title, subtitle, actions area. Also
 * reserves a `searchSlot` on the right for the (forthcoming) global
 * Cmd-K launcher; leave it blank for now or pass a placeholder.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.actions] Right-aligned action buttons.
 * @param {React.ReactNode} [props.searchSlot] Reserved for global search.
 * @param {string} [props.backHref='/admin'] Breadcrumb destination.
 * @param {string} [props.backLabel='Admin'] Breadcrumb label.
 * @param {boolean} [props.hideBreadcrumb=false]
 * @param {object} [props.style]
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  searchSlot,
  backHref = '/admin',
  backLabel = 'Admin',
  hideBreadcrumb = false,
  style,
}) {
  return (
    <header style={{ marginBottom: S[6], ...style }}>
      {!hideBreadcrumb && (
        <nav
          aria-label="Breadcrumb"
          style={{
            fontSize: F.sm,
            color: ADMIN_C.dim,
            marginBottom: S[2],
            display: 'flex',
            alignItems: 'center',
            gap: S[1],
          }}
        >
          <Link
            href={backHref}
            style={{
              color: ADMIN_C.dim,
              textDecoration: 'none',
              padding: '2px 4px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = ADMIN_C.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ADMIN_C.dim;
            }}
          >
            {backLabel}
          </Link>
          <span aria-hidden="true" style={{ color: ADMIN_C.muted }}>
            /
          </span>
          <span style={{ color: ADMIN_C.soft }}>{title}</span>
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: S[4],
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <h1
            style={{
              margin: 0,
              fontSize: F.xxl,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: ADMIN_C.white,
              lineHeight: 1.15,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: `${S[1]}px 0 0`,
                fontSize: F.md,
                color: ADMIN_C.dim,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {searchSlot}
          {actions}
        </div>
      </div>
    </header>
  );
}

/**
 * @example
 * import Page, { PageHeader } from '@/components/admin/Page';
 * <Page>
 *   <PageHeader
 *     title="Stories"
 *     subtitle="All published stories"
 *     actions={<Button variant="primary">New story</Button>}
 *   />
 *   {children}
 * </Page>
 */
