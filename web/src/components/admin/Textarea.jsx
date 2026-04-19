// @admin-verified 2026-04-18
'use client';

import { forwardRef } from 'react';
import { ADMIN_C, F } from '../../lib/adminPalette';

/**
 * Native <textarea> with admin styling.
 *
 * @param {object} props
 * @param {boolean} [props.error=false]
 * @param {number} [props.rows=4]
 * @param {boolean} [props.block=true]
 * @param {boolean} [props.autoGrow=false] If true, expands vertically with content.
 * @param {object} [props.style]
 */
const Textarea = forwardRef(function Textarea(
  {
    error = false,
    rows = 4,
    block = true,
    autoGrow = false,
    style,
    onFocus,
    onBlur,
    onInput,
    ...rest
  },
  ref,
) {
  const borderColor = error ? ADMIN_C.danger : ADMIN_C.border;

  const grow = (el) => {
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <textarea
      ref={(el) => {
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
        if (autoGrow) grow(el);
      }}
      rows={rows}
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
      onInput={(e) => {
        if (autoGrow) grow(e.currentTarget);
        onInput?.(e);
      }}
      style={{
        width: block ? '100%' : undefined,
        padding: '8px 10px',
        fontSize: F.base,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: ADMIN_C.white,
        background: ADMIN_C.bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        outline: 'none',
        lineHeight: 1.5,
        resize: autoGrow ? 'none' : 'vertical',
        boxSizing: 'border-box',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        ...style,
      }}
      {...rest}
    />
  );
});

export default Textarea;

/**
 * @example
 * import Textarea from '@/components/admin/Textarea';
 * <Textarea rows={6} placeholder="Description" value={d} onChange={e=>setD(e.target.value)} />
 */
