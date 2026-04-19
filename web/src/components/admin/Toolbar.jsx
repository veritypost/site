// @admin-verified 2026-04-18
'use client';

import { ADMIN_C, S } from '../../lib/adminPalette';

/**
 * The bar above a DataTable. Three slots: `left` (filters/search),
 * `center` (occasional; usually empty), `right` (action buttons).
 * Plain children are placed on the left for backwards-compat.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.left]
 * @param {React.ReactNode} [props.center]
 * @param {React.ReactNode} [props.right]
 * @param {boolean} [props.bordered=false] Add a border + padding (card-style toolbar).
 * @param {object} [props.style]
 * @param {React.ReactNode} [props.children] Shorthand for `left`.
 */
export default function Toolbar({
  left,
  center,
  right,
  bordered = false,
  style,
  children,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S[2],
        flexWrap: 'wrap',
        marginBottom: S[3],
        padding: bordered ? `${S[2]}px ${S[3]}px` : 0,
        border: bordered ? `1px solid ${ADMIN_C.divider}` : undefined,
        borderRadius: bordered ? 8 : undefined,
        background: bordered ? ADMIN_C.bg : undefined,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: S[2],
          flex: '1 1 auto',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        {left ?? children}
      </div>
      {center && (
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>{center}</div>
      )}
      {right && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

/**
 * @example
 * import Toolbar from '@/components/admin/Toolbar';
 * <Toolbar
 *   left={<TextInput type="search" placeholder="Search" />}
 *   right={<Button variant="primary">New</Button>}
 * />
 */
