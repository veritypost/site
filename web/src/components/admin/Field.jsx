// @admin-verified 2026-04-23
'use client';

import { ADMIN_C, F, S } from '../../lib/adminPalette';

/**
 * Shared input field wrapper — label + (optional) hint + error row.
 * Wrap any input (TextInput, Select, Textarea, etc.) in a Field to get
 * consistent label spacing and a11y wiring.
 *
 * Pass `id` so the <label htmlFor> hooks to your input; if you don't,
 * the label's still rendered but not programmatically associated.
 *
 * @param {object} props
 * @param {string} [props.id] Matches htmlFor; required for a11y.
 * @param {string} [props.label]
 * @param {React.ReactNode} [props.hint]
 * @param {React.ReactNode} [props.error] String or node. When truthy, replaces hint.
 * @param {boolean} [props.required=false] Adds a visual `*`.
 * @param {boolean} [props.inline=false] Render label inline-left of the input.
 * @param {object} [props.style] Applied to the wrapper <div>.
 * @param {React.ReactNode} props.children The input element.
 */
export default function Field({
  id,
  label,
  hint,
  error,
  required = false,
  inline = false,
  style,
  children,
}) {
  const descId = id ? `${id}-desc` : undefined;
  const errId = id ? `${id}-err` : undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: inline ? 'row' : 'column',
        alignItems: inline ? 'center' : 'stretch',
        gap: inline ? S[3] : S[1],
        marginBottom: S[3],
        ...style,
      }}
    >
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: F.sm,
            fontWeight: 500,
            color: ADMIN_C.soft,
            lineHeight: 1.4,
            minWidth: inline ? 140 : undefined,
          }}
        >
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: ADMIN_C.danger, marginLeft: 2 }}>
              *
            </span>
          )}
        </label>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {children}

        {error ? (
          <div
            id={errId}
            role="alert"
            style={{
              marginTop: S[1],
              fontSize: F.xs,
              color: ADMIN_C.danger,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        ) : hint ? (
          <div
            id={descId}
            style={{
              marginTop: S[1],
              fontSize: F.xs,
              color: ADMIN_C.dim,
              lineHeight: 1.4,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * @example
 * import Field from '@/components/admin/Field';
 * import TextInput from '@/components/admin/TextInput';
 * <Field id="title" label="Title" hint="Shown in feed" required>
 *   <TextInput id="title" value={t} onChange={(e)=>setT(e.target.value)} />
 * </Field>
 */
