// @admin-verified 2026-04-18
'use client';

import { forwardRef } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Native <input type="checkbox"> with admin styling. Renders a label
 * next to the box when `label` is set, otherwise the bare input.
 *
 * @param {object} props
 * @param {string} [props.label]
 * @param {React.ReactNode} [props.hint]
 * @param {boolean} [props.checked]
 * @param {boolean} [props.indeterminate=false]
 * @param {boolean} [props.disabled=false]
 * @param {(e: Event) => void} [props.onChange]
 * @param {object} [props.style] Applied to the outer <label>.
 */
const Checkbox = forwardRef(function Checkbox(
  {
    label,
    hint,
    indeterminate = false,
    disabled = false,
    style,
    onChange,
    ...rest
  },
  ref,
) {
  const setRef = (el) => {
    if (el) el.indeterminate = indeterminate;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const input = (
    <input
      ref={setRef}
      type="checkbox"
      disabled={disabled}
      onChange={onChange}
      style={{
        width: 14,
        height: 14,
        margin: 0,
        accentColor: ADMIN_C.accent,
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
      {...rest}
    />
  );

  if (!label && !hint) return input;

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: S[2],
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 20 }}>{input}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {label && (
          <span style={{ fontSize: F.base, color: ADMIN_C.white, lineHeight: 1.4 }}>
            {label}
          </span>
        )}
        {hint && (
          <span style={{ fontSize: F.xs, color: ADMIN_C.dim, lineHeight: 1.4 }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
});

export default Checkbox;

/**
 * @example
 * import Checkbox from '@/components/admin/Checkbox';
 * <Checkbox label="Verified" checked={v} onChange={e=>setV(e.target.checked)} />
 * <Checkbox indeterminate label="Select all" />
 */
