// @admin-verified 2026-04-23
'use client';

import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Empty-state placeholder — icon + heading + description + optional CTA.
 * Used inside empty DataTables, empty search results, empty lists.
 * Always populate: "blank" is never the right answer; admins should
 * see either data or a prompt that suggests the next step.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.icon] Small decorative node.
 * @param {string} props.title
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.cta] A Button (or link) element.
 * @param {'sm'|'md'} [props.size='md']
 * @param {object} [props.style]
 */
export default function EmptyState({ icon, title, description, cta, size = 'md', style }) {
  const padding = size === 'sm' ? S[6] : S[12];
  return (
    <div
      role="status"
      style={{
        padding: `${padding}px ${S[4]}px`,
        textAlign: 'center',
        color: ADMIN_C.dim,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: S[2],
        ...style,
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: ADMIN_C.card,
            border: `1px solid ${ADMIN_C.divider}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ADMIN_C.soft,
            marginBottom: S[1],
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ fontSize: F.md, fontWeight: 600, color: ADMIN_C.white }}>{title}</div>
      {description && (
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim, maxWidth: 360, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {cta && <div style={{ marginTop: S[2] }}>{cta}</div>}
    </div>
  );
}

/**
 * @example
 * import EmptyState from '@/components/admin/EmptyState';
 * import Button from '@/components/admin/Button';
 * <EmptyState
 *   title="No stories yet"
 *   description="Draft your first story to see it appear here."
 *   cta={<Button variant="primary">New story</Button>}
 * />
 */
