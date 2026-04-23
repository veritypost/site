'use client';

import { ADMIN_C } from '../../lib/adminPalette';

/**
 * Subtle loading indicator — a 1px-ring circle that spins.
 *
 * @param {object} props
 * @param {number} [props.size=14] Diameter in px.
 * @param {string} [props.color] Override ring color. Defaults to ADMIN_C.accent.
 * @param {string} [props.label='Loading'] aria-label for screen readers.
 * @param {object} [props.style] Extra style overrides merged last.
 */
export default function Spinner({ size = 14, color, label = 'Loading', style }) {
  const ring = color || ADMIN_C.accent;
  const thickness = Math.max(1, Math.round(size / 10));
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${thickness}px solid ${ADMIN_C.divider}`,
        borderTopColor: ring,
        animation: 'vp-admin-spin 0.7s linear infinite',
        verticalAlign: '-2px',
        ...style,
      }}
    >
      <style>{`
        @keyframes vp-admin-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}

/**
 * @example
 * import Spinner from '@/components/admin/Spinner';
 * <Button loading><Spinner size={12} color="#fff" /> Saving</Button>
 */
