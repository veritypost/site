// T117 — Shared error-state primitive for adult web surfaces.
// Use wherever a data fetch fails and the page wants to render a
// retry-or-explain block in line with the surrounding content.
//
// Pairs with EmptyState (which handles "no data" rather than "fetch failed").
// The admin surface has its own error patterns inside @/components/admin/*;
// this file is for the reader-facing surfaces only.
'use client';

import { CSSProperties, ReactNode, useState } from 'react';

interface ErrorStateProps {
  /** Primary message. Keep to one short sentence with a concrete reason. */
  message?: string;
  /** Optional retry handler. When provided, a Retry button is rendered. */
  onRetry?: () => void | Promise<void>;
  /**
   * Compact (inline) vs hero layout. `inline` keeps the block flush with
   * surrounding rows; the default hero layout centers + adds vertical padding
   * for full-page error states.
   */
  inline?: boolean;
  /** Optional supporting node rendered below the message (e.g. extra link). */
  children?: ReactNode;
  /** Additional wrapper styles. */
  style?: CSSProperties;
}

/**
 * ErrorState — standard error block for adult reader surfaces.
 *
 * Renders the message and, when `onRetry` is provided, a Retry button that
 * tracks an internal `busy` flag while the handler resolves. Async
 * handlers are supported.
 *
 * @example
 * <ErrorState
 *   message="Couldn't load notifications. Try again."
 *   onRetry={() => loadNotifications()}
 * />
 */
export default function ErrorState({
  message = 'Something went wrong.',
  onRetry,
  inline = false,
  children,
  style,
}: ErrorStateProps) {
  const [busy, setBusy] = useState(false);

  async function handleRetry() {
    if (!onRetry || busy) return;
    try {
      setBusy(true);
      await onRetry();
    } finally {
      setBusy(false);
    }
  }

  const wrapperStyle: CSSProperties = inline
    ? {
        background: 'var(--card, #f7f7f7)',
        border: '1px solid var(--border, #e5e5e5)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        color: 'var(--text-primary, #111)',
        ...style,
      }
    : {
        padding: '40px 20px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        ...style,
      };

  const messageStyle: CSSProperties = inline
    ? { fontSize: 13, color: 'var(--text-primary, #111)', flex: 1, minWidth: 200, margin: 0 }
    : {
        fontSize: 14,
        color: 'var(--text-primary, #111)',
        lineHeight: 1.5,
        maxWidth: 420,
        margin: 0,
      };

  const buttonStyle: CSSProperties = {
    padding: inline ? '6px 14px' : '9px 20px',
    minHeight: inline ? 32 : 40,
    background: 'var(--accent, #111)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
    fontFamily: 'inherit',
    flexShrink: 0,
  };

  return (
    <div role="alert" style={wrapperStyle}>
      <p style={messageStyle}>{message}</p>
      {children}
      {onRetry && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          aria-busy={busy}
          style={buttonStyle}
        >
          {busy ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
