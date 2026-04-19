// @admin-verified 2026-04-18
'use client';

import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Section inside a Page. Title + optional description + horizontal rule
 * + content slot. Pure vertical-rhythm container.
 *
 * @param {object} props
 * @param {string} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.aside] Right-aligned content in the heading row.
 * @param {boolean} [props.boxed=false] If true, wraps children in a bordered card.
 * @param {boolean} [props.divider=true] Show the horizontal rule under the title.
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 */
export default function PageSection({
  title,
  description,
  aside,
  boxed = false,
  divider = true,
  style,
  children,
}) {
  return (
    <section style={{ marginBottom: S[8], ...style }}>
      {(title || description || aside) && (
        <div style={{ marginBottom: S[3] }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: S[4],
              flexWrap: 'wrap',
            }}
          >
            {title && (
              <h2
                style={{
                  margin: 0,
                  fontSize: F.lg,
                  fontWeight: 600,
                  color: ADMIN_C.white,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h2>
            )}
            {aside && <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>{aside}</div>}
          </div>
          {description && (
            <p
              style={{
                margin: `${S[1]}px 0 0`,
                fontSize: F.sm,
                color: ADMIN_C.dim,
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
          {divider && (
            <div
              role="presentation"
              style={{
                marginTop: S[3],
                height: 1,
                background: ADMIN_C.divider,
              }}
            />
          )}
        </div>
      )}

      {boxed ? (
        <div
          style={{
            border: `1px solid ${ADMIN_C.divider}`,
            borderRadius: 8,
            background: ADMIN_C.bg,
            padding: S[4],
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * @example
 * import PageSection from '@/components/admin/PageSection';
 * <PageSection title="Filters" description="Narrow the list" boxed>
 *   <Toolbar>...</Toolbar>
 * </PageSection>
 */
