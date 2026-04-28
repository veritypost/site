// Labeled form row. Replaces the legacy ad-hoc <label>+inline-style+input
// repetition. Renders label, optional hint, the control, and an optional
// inline error. Keyboard a11y, ID-wired-correctly, focus-ring on focus.

'use client';

import { useId } from 'react';

import { C, F, FONT, R, S, SH } from '../_lib/palette';

interface Props {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  // T343 — when set, renders a red asterisk next to the label so the
  // required state is visible BEFORE submit fails. Mutually exclusive
  // with `optional` (caller picks one).
  required?: boolean;
  children: (id: string) => React.ReactNode;
}

export function Field({ label, hint, error, optional, required, children }: Props) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[1], fontFamily: FONT.sans }}>
      <label
        htmlFor={id}
        style={{
          fontSize: F.sm,
          fontWeight: 600,
          color: C.inkSoft,
          display: 'flex',
          gap: S[2],
          alignItems: 'baseline',
        }}
      >
        {label}
        {required ? (
          <span aria-hidden style={{ color: C.danger, fontWeight: 700, fontSize: F.sm }}>
            *
          </span>
        ) : null}
        {optional ? (
          <span style={{ fontWeight: 400, color: C.inkFaint, fontSize: F.xs }}>(optional)</span>
        ) : null}
      </label>
      {children(id)}
      {error ? (
        <div style={{ fontSize: F.xs, color: C.danger }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: F.xs, color: C.inkMuted, lineHeight: 1.5 }}>{hint}</div>
      ) : null}
    </div>
  );
}

// Shared input + textarea + button styling so every card looks the same.
//
// T335 — keyboard focus ring is provided by the global `*:focus-visible`
// rule in `app/globals.css` (2px solid + 2px offset). The previous
// `outline: 'none'` inline override clobbered that rule (inline styles
// beat CSS specificity), so keyboard users got zero focus feedback on
// every input + textarea in the redesign tree. Removed it. The button
// styles below didn't have the override, so they were already fine.
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: `${S[3]}px ${S[3]}px`,
  fontSize: F.base,
  fontFamily: FONT.sans,
  color: C.ink,
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: R.md,
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: 'vertical',
  fontFamily: FONT.sans,
  lineHeight: 1.5,
};

export const buttonPrimaryStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[4]}px`,
  background: C.ink,
  color: C.bg,
  border: 'none',
  borderRadius: R.md,
  fontSize: F.sm,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 120ms ease, transform 120ms ease',
  fontFamily: FONT.sans,
  boxShadow: SH.ambient,
};

export const buttonSecondaryStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[4]}px`,
  background: C.bg,
  color: C.ink,
  border: `1px solid ${C.border}`,
  borderRadius: R.md,
  fontSize: F.sm,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONT.sans,
};

export const buttonDangerStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[4]}px`,
  background: C.danger,
  color: '#fff',
  border: 'none',
  borderRadius: R.md,
  fontSize: F.sm,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONT.sans,
};

export const buttonGhostStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[3]}px`,
  background: 'transparent',
  color: C.inkSoft,
  border: 'none',
  borderRadius: R.md,
  fontSize: F.sm,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: FONT.sans,
};
