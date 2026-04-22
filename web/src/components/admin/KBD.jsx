// @admin-verified 2026-04-18
'use client';

import { ADMIN_C, F } from '../../lib/adminPalette';

/**
 * Renders a keyboard shortcut visually as a row of <kbd> chips.
 *
 * Pass either a single string or an array. Strings are split on '+'
 * so callers can write `<KBD keys="Cmd+K" />` and get two chips.
 *
 * @param {object} props
 * @param {string|string[]} props.keys e.g. 'Cmd+K' or ['Cmd','K'] or 'Esc'.
 * @param {'xs'|'sm'} [props.size='sm']
 * @param {object} [props.style] Outer wrapper style.
 */
export default function KBD({ keys, size = 'sm', style }) {
  const list = Array.isArray(keys)
    ? keys
    : String(keys)
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);
  const fontSize = size === 'xs' ? F.xs : F.sm;
  const padY = size === 'xs' ? 1 : 2;
  const padX = size === 'xs' ? 4 : 6;

  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', ...style }}>
      {list.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize,
            lineHeight: 1,
            padding: `${padY}px ${padX}px`,
            background: ADMIN_C.card,
            color: ADMIN_C.soft,
            border: `1px solid ${ADMIN_C.divider}`,
            borderBottomWidth: 2,
            borderRadius: 4,
            fontWeight: 500,
            minWidth: size === 'xs' ? 14 : 16,
            textAlign: 'center',
            display: 'inline-block',
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/**
 * @example
 * import KBD from '@/components/admin/KBD';
 * <span>Press <KBD keys="Cmd+K" /> to search</span>
 * <KBD keys="Esc" size="xs" />
 */
