// @admin-verified 2026-04-23
'use client';

import { forwardRef } from 'react';
import { ADMIN_C, F } from '../../lib/adminPalette';

/**
 * Native <select>. Consumers pass either `options` (array of
 * `{value,label}`) or <option> children.
 *
 * @param {object} props
 * @param {Array<{value:string,label:string}>} [props.options]
 * @param {boolean} [props.error=false]
 * @param {'sm'|'md'} [props.size='md']
 * @param {boolean} [props.block=true]
 * @param {string} [props.placeholder] Adds a disabled/empty first option.
 * @param {object} [props.style]
 */
const Select = forwardRef(function Select(
  {
    options,
    error = false,
    size = 'md',
    block = true,
    placeholder,
    style,
    onFocus,
    onBlur,
    children,
    ...rest
  },
  ref
) {
  const padY = size === 'sm' ? 4 : 6;
  const padX = size === 'sm' ? 8 : 10;
  const fontSize = size === 'sm' ? F.sm : F.base;
  const borderColor = error ? ADMIN_C.danger : ADMIN_C.border;

  return (
    <select
      ref={ref}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 2px ${error ? 'rgba(239,68,68,0.35)' : ADMIN_C.ring}`;
        e.currentTarget.style.borderColor = error ? ADMIN_C.danger : ADMIN_C.accent;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = borderColor;
        onBlur?.(e);
      }}
      style={{
        width: block ? '100%' : undefined,
        padding: `${padY}px ${padX + 18}px ${padY}px ${padX}px`,
        fontSize,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: ADMIN_C.white,
        background: `${ADMIN_C.bg} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%23666666' d='M0 0l5 6 5-6z'/></svg>") no-repeat right 10px center`,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        outline: 'none',
        lineHeight: 1.4,
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        ...style,
      }}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        : children}
    </select>
  );
});

export default Select;

/**
 * @example
 * import Select from '@/components/admin/Select';
 * <Select
 *   value={status}
 *   onChange={e => setStatus(e.target.value)}
 *   options={[{value:'active',label:'Active'},{value:'archived',label:'Archived'}]}
 * />
 */
