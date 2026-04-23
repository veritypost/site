// @admin-verified 2026-04-23
'use client';

import { ADMIN_C, F } from '../../lib/adminPalette';

const VARIANTS = {
  neutral: { bg: ADMIN_C.card, fg: ADMIN_C.soft, border: ADMIN_C.divider },
  success: { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', border: 'rgba(34,197,94,0.35)' },
  warn: { bg: 'rgba(245,158,11,0.14)', fg: '#a15e00', border: 'rgba(245,158,11,0.40)' },
  danger: { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c', border: 'rgba(239,68,68,0.35)' },
  info: { bg: 'rgba(37,99,235,0.10)', fg: '#1d4ed8', border: 'rgba(37,99,235,0.30)' },
  ghost: { bg: 'transparent', fg: ADMIN_C.dim, border: ADMIN_C.divider },
};

/**
 * Small status pill — used inline in tables, headers, row labels.
 *
 * @param {object} props
 * @param {'neutral'|'success'|'warn'|'danger'|'info'|'ghost'} [props.variant='neutral']
 * @param {'xs'|'sm'} [props.size='sm']
 * @param {boolean} [props.dot=false] If true, shows a colored dot before the label.
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 */
export default function Badge({ variant = 'neutral', size = 'sm', dot = false, style, children }) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  const isXs = size === 'xs';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: isXs ? '1px 6px' : '2px 8px',
        fontSize: isXs ? F.xs : F.sm,
        lineHeight: 1.4,
        fontWeight: 500,
        color: v.fg,
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: 999,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: v.fg,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  );
}

/**
 * @example
 * import Badge from '@/components/admin/Badge';
 * <Badge variant="success" dot>Active</Badge>
 * <Badge variant="warn" size="xs">Flagged</Badge>
 */
