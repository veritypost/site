// @admin-verified 2026-04-23
'use client';

import { forwardRef } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';
import Spinner from './Spinner';

const SIZES = {
  sm: { padY: 4, padX: 10, fontSize: F.sm, height: 26 },
  md: { padY: 6, padX: 14, fontSize: F.base, height: 32 },
};

const VARIANTS = {
  primary: {
    bg: ADMIN_C.accent,
    fg: '#ffffff',
    border: ADMIN_C.accent,
    hoverBg: '#000000',
    spinnerColor: '#ffffff',
  },
  secondary: {
    bg: ADMIN_C.bg,
    fg: ADMIN_C.accent,
    border: ADMIN_C.border,
    hoverBg: ADMIN_C.card,
    spinnerColor: ADMIN_C.accent,
  },
  ghost: {
    bg: 'transparent',
    fg: ADMIN_C.soft,
    border: 'transparent',
    hoverBg: ADMIN_C.hover,
    spinnerColor: ADMIN_C.accent,
  },
  danger: {
    bg: ADMIN_C.danger,
    fg: '#ffffff',
    border: ADMIN_C.danger,
    hoverBg: '#dc2626',
    spinnerColor: '#ffffff',
  },
};

/**
 * Primary admin button. Inline-style; no className dependency.
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} [props.variant='secondary']
 * @param {'sm'|'md'} [props.size='md']
 * @param {boolean} [props.loading=false] Shows spinner and disables button.
 * @param {boolean} [props.disabled=false]
 * @param {'button'|'submit'|'reset'} [props.type='button']
 * @param {boolean} [props.block=false] Full width.
 * @param {React.ReactNode} [props.leftIcon]
 * @param {React.ReactNode} [props.rightIcon]
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 */
const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'button',
    block = false,
    leftIcon,
    rightIcon,
    style,
    children,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const sz = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isDisabled) e.currentTarget.style.background = v.hoverBg;
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = v.bg;
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 2px ${ADMIN_C.ring}`;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        onBlur?.(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: S[2],
        padding: `${sz.padY}px ${sz.padX}px`,
        minHeight: sz.height,
        fontSize: sz.fontSize,
        fontWeight: 500,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        lineHeight: 1.2,
        color: v.fg,
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: 6,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled && !loading ? 0.55 : 1,
        width: block ? '100%' : undefined,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        transition: 'background 120ms ease, box-shadow 120ms ease',
        outline: 'none',
        ...style,
      }}
      {...rest}
    >
      {loading && <Spinner size={sz.fontSize} color={v.spinnerColor} />}
      {!loading && leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
});

export default Button;

/**
 * @example
 * import Button from '@/components/admin/Button';
 * <Button variant="primary" onClick={save}>Save</Button>
 * <Button variant="danger" loading>Deleting</Button>
 * <Button variant="ghost" size="sm">Cancel</Button>
 */
