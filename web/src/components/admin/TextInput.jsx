// @admin-verified 2026-04-23
'use client';

import { forwardRef } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Native <input type="text|email|url|search|password|tel"> with
 * admin styling. Supports error state via `error` boolean (adds red
 * border) — actual error copy lives on the surrounding <Field>.
 *
 * @param {object} props
 * @param {'text'|'email'|'url'|'search'|'password'|'tel'} [props.type='text']
 * @param {boolean} [props.error=false]
 * @param {'sm'|'md'} [props.size='md']
 * @param {React.ReactNode} [props.leftAddon] Rendered inside the input border, left side.
 * @param {React.ReactNode} [props.rightAddon]
 * @param {boolean} [props.block=true] Full-width by default.
 * @param {object} [props.style]
 */
const TextInput = forwardRef(function TextInput(
  {
    type = 'text',
    error = false,
    size = 'md',
    leftAddon,
    rightAddon,
    block = true,
    style,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const padY = size === 'sm' ? 4 : 6;
  const padX = size === 'sm' ? 8 : 10;
  const fontSize = size === 'sm' ? F.sm : F.base;
  const borderColor = error ? ADMIN_C.danger : ADMIN_C.border;

  const inputStyle = {
    width: block ? '100%' : undefined,
    padding: `${padY}px ${padX}px`,
    fontSize,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: ADMIN_C.white,
    background: ADMIN_C.bg,
    border: leftAddon || rightAddon ? 'none' : `1px solid ${borderColor}`,
    borderRadius: 6,
    outline: 'none',
    lineHeight: 1.4,
    boxSizing: 'border-box',
    transition: 'box-shadow 120ms ease, border-color 120ms ease',
    ...style,
  };

  const focusHandler = (e) => {
    const target = leftAddon || rightAddon ? e.currentTarget.parentElement : e.currentTarget;
    target.style.boxShadow = `0 0 0 2px ${error ? 'rgba(239,68,68,0.35)' : ADMIN_C.ring}`;
    target.style.borderColor = error ? ADMIN_C.danger : ADMIN_C.accent;
    onFocus?.(e);
  };
  const blurHandler = (e) => {
    const target = leftAddon || rightAddon ? e.currentTarget.parentElement : e.currentTarget;
    target.style.boxShadow = 'none';
    target.style.borderColor = borderColor;
    onBlur?.(e);
  };

  if (leftAddon || rightAddon) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: block ? '100%' : undefined,
          border: `1px solid ${borderColor}`,
          borderRadius: 6,
          background: ADMIN_C.bg,
          transition: 'box-shadow 120ms ease, border-color 120ms ease',
        }}
      >
        {leftAddon && (
          <span
            style={{
              padding: `0 ${S[2]}px`,
              color: ADMIN_C.muted,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {leftAddon}
          </span>
        )}
        <input
          ref={ref}
          type={type}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={inputStyle}
          {...rest}
        />
        {rightAddon && (
          <span
            style={{
              padding: `0 ${S[2]}px`,
              color: ADMIN_C.muted,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {rightAddon}
          </span>
        )}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      type={type}
      onFocus={focusHandler}
      onBlur={blurHandler}
      style={inputStyle}
      {...rest}
    />
  );
});

export default TextInput;

/**
 * @example
 * import TextInput from '@/components/admin/TextInput';
 * <TextInput placeholder="Search stories" value={q} onChange={e=>setQ(e.target.value)} />
 * <TextInput type="search" leftAddon="⌕" />
 */
