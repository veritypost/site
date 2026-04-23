'use client';

import { ADMIN_C, S } from '../../lib/adminPalette';

/**
 * Shimmering skeleton bar. Use inside a table cell or a list row
 * while data is loading.
 *
 * @param {object} props
 * @param {number|string} [props.width='100%']
 * @param {number} [props.height=12]
 * @param {number} [props.radius=4]
 * @param {object} [props.style]
 */
export function SkeletonBar({ width = '100%', height = 12, radius = 4, style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${ADMIN_C.card} 0%, ${ADMIN_C.hover} 50%, ${ADMIN_C.card} 100%)`,
        backgroundSize: '200% 100%',
        animation: 'vp-admin-shimmer 1.4s ease-in-out infinite',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      <style>{`
        @keyframes vp-admin-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </span>
  );
}

/**
 * A full <tr> of skeleton bars. Drop into a table's <tbody> while
 * loading. Pass the same `columns` as DataTable to match widths.
 *
 * @param {object} props
 * @param {number} [props.columns=4] Count of cells to render.
 * @param {'default'|'compact'} [props.density='default']
 * @param {React.CSSProperties} [props.style]
 */
export default function SkeletonRow({ columns = 4, density = 'default', style }) {
  const padY = density === 'compact' ? 4 : 8;
  return (
    <tr style={style}>
      {Array.from({ length: columns }).map((_, i) => (
        <td
          key={i}
          style={{
            padding: `${padY}px ${S[3]}px`,
            borderBottom: `1px solid ${ADMIN_C.divider}`,
          }}
        >
          <SkeletonBar width={`${60 + ((i * 17) % 35)}%`} />
        </td>
      ))}
    </tr>
  );
}

/**
 * @example
 * import SkeletonRow, { SkeletonBar } from '@/components/admin/SkeletonRow';
 * <tbody>
 *   {loading && Array.from({length: 5}).map((_,i) => <SkeletonRow key={i} columns={4} />)}
 * </tbody>
 * <p><SkeletonBar width={140} /></p>
 */
