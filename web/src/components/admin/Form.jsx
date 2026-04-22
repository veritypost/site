// @admin-verified 2026-04-18
'use client';

import { S } from '../../lib/adminPalette';

/**
 * Form element with consistent vertical rhythm. Stops the default
 * browser form submit unless `onSubmit` returns truthy; otherwise
 * callers can treat it exactly like a native <form>.
 *
 * @param {object} props
 * @param {(e: Event) => void} [props.onSubmit]
 * @param {'sm'|'md'|'lg'} [props.gap='md'] Gap between direct children.
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 */
export default function Form({ onSubmit, gap = 'md', style, children, ...rest }) {
  const gapPx = gap === 'sm' ? S[2] : gap === 'lg' ? S[6] : S[4];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
      noValidate
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: gapPx,
        ...style,
      }}
      {...rest}
    >
      {children}
    </form>
  );
}

/**
 * A horizontal row of form actions (typically Cancel / Save).
 * Aligns right by default.
 *
 * @param {object} props
 * @param {'left'|'right'|'between'} [props.align='right']
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 */
export function FormActions({ align = 'right', style, children }) {
  const justify =
    align === 'left' ? 'flex-start' : align === 'between' ? 'space-between' : 'flex-end';
  return (
    <div
      style={{
        display: 'flex',
        gap: S[2],
        justifyContent: justify,
        alignItems: 'center',
        marginTop: S[2],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * @example
 * import Form, { FormActions } from '@/components/admin/Form';
 * <Form onSubmit={save}>
 *   <Field label="Title"><TextInput value={t} onChange={e=>setT(e.target.value)} /></Field>
 *   <FormActions>
 *     <Button variant="ghost" onClick={cancel}>Cancel</Button>
 *     <Button variant="primary" type="submit">Save</Button>
 *   </FormActions>
 * </Form>
 */
