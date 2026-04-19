// @admin-verified 2026-04-18
'use client';

import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Dashboard tile: label, value, delta, sparkline slot.
 *
 * Delta is a signed percentage or count; pass as string for full
 * control (`'+12.4%'`, `'-3 today'`). Color is derived from the
 * leading sign unless `trend` is explicit.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.value Big number or short string.
 * @param {string} [props.delta] e.g. '+12%', '-3'
 * @param {'up'|'down'|'flat'} [props.trend] Override color.
 * @param {React.ReactNode} [props.sparkline] Arbitrary chart node.
 * @param {React.ReactNode} [props.footnote]
 * @param {object} [props.style]
 */
export default function StatCard({
  label,
  value,
  delta,
  trend,
  sparkline,
  footnote,
  style,
}) {
  let resolvedTrend = trend;
  if (!resolvedTrend && typeof delta === 'string') {
    if (delta.trim().startsWith('-')) resolvedTrend = 'down';
    else if (delta.trim().startsWith('+')) resolvedTrend = 'up';
    else resolvedTrend = 'flat';
  }

  const deltaColor =
    resolvedTrend === 'up' ? ADMIN_C.success
    : resolvedTrend === 'down' ? ADMIN_C.danger
    : ADMIN_C.dim;

  return (
    <div
      style={{
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 8,
        padding: S[4],
        background: ADMIN_C.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: S[2],
        minWidth: 0,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: F.xs,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: ADMIN_C.dim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: S[3],
        }}
      >
        <div
          style={{
            fontSize: F.xxl,
            fontWeight: 600,
            color: ADMIN_C.white,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
        {sparkline && <div style={{ flexShrink: 0, opacity: 0.9 }}>{sparkline}</div>}
      </div>
      {(delta || footnote) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
            fontSize: F.sm,
            color: ADMIN_C.dim,
            lineHeight: 1.4,
          }}
        >
          {delta && (
            <span style={{ color: deltaColor, fontWeight: 500 }}>{delta}</span>
          )}
          {footnote && <span>{footnote}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * @example
 * import StatCard from '@/components/admin/StatCard';
 * <StatCard label="Active users" value="12,480" delta="+4.2%" footnote="vs last week" />
 */
