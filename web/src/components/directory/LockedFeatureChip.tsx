'use client';

// Stream B — Locked-feature chip for /directory.
// Inline pill (icon + "Verity" label) shown adjacent to a gated control
// (e.g., the Trending sort pill). NOT a modal — that's LockedFeatureCTA.
// Tapping the chip routes to the upgrade surface so the affordance is
// also the CTA.

import Link from 'next/link';
import type { CSSProperties } from 'react';

interface LockedFeatureChipProps {
  /** Optional human label override. Default: "Verity" */
  label?: string;
  /** Destination — defaults to the billing/pricing surface. */
  href?: string;
  /** Optional aria label so the chip is meaningful out of context. */
  ariaLabel?: string;
  style?: CSSProperties;
}

export default function LockedFeatureChip({
  label = 'Verity',
  href = '/pricing',
  ariaLabel,
  style,
}: LockedFeatureChipProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel || `${label} — upgrade to unlock`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--accent-bg)',
        color: 'var(--text-secondary)',
        fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        lineHeight: 1.4,
        ...style,
      }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <rect x="3" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.55" />
        <path
          d="M4.5 7V5a2.5 2.5 0 0 1 5 0V7"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </Link>
  );
}
