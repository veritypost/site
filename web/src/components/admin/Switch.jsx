'use client';

import { forwardRef, useState, useEffect } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * iOS-style toggle. Optimistic: clicks update local state immediately
 * and fire `onChange(nextValue)`. Consumers can call async handlers
 * without worrying about visual lag.
 *
 * @param {object} props
 * @param {boolean} props.checked Controlled value.
 * @param {(next: boolean) => void} [props.onChange] Called with next value.
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.label]
 * @param {React.ReactNode} [props.hint]
 * @param {string} [props.id]
 * @param {object} [props.style] Applied to outer <label>.
 */
const Switch = forwardRef(function Switch(
  { checked = false, onChange, disabled = false, label, hint, id, style },
  ref
) {
  // Local mirror: optimistic UI. We flip immediately on click and then
  // call onChange. If the parent rejects the change and keeps `checked`
  // as-is, the effect below snaps us back.
  const [local, setLocal] = useState(checked);
  useEffect(() => {
    setLocal(checked);
  }, [checked]);

  const handleClick = () => {
    if (disabled) return;
    const next = !local;
    setLocal(next);
    onChange?.(next);
  };

  const toggle = (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={local}
      disabled={disabled}
      onClick={handleClick}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 2px ${ADMIN_C.ring}`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
      style={{
        width: 32,
        height: 18,
        padding: 0,
        border: 'none',
        borderRadius: 999,
        position: 'relative',
        background: local ? ADMIN_C.accent : ADMIN_C.divider,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 140ms ease, box-shadow 120ms ease',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: local ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 140ms ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );

  if (!label && !hint) return toggle;

  return (
    <label
      htmlFor={id}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: S[2],
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {toggle}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {label && (
          <span style={{ fontSize: F.base, color: ADMIN_C.white, lineHeight: 1.4 }}>{label}</span>
        )}
        {hint && (
          <span style={{ fontSize: F.xs, color: ADMIN_C.dim, lineHeight: 1.4 }}>{hint}</span>
        )}
      </span>
    </label>
  );
});

export default Switch;

/**
 * @example
 * import Switch from '@/components/admin/Switch';
 * <Switch
 *   label="Notifications"
 *   checked={on}
 *   onChange={async (next) => { setOn(next); await saveFlag(next); }}
 * />
 */
