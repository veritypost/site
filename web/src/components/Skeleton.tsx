// T-042 — Skeleton loading placeholder for adult web surfaces.
// CSS shimmer defined in globals.css (.vp-skeleton / @keyframes vpShimmer).
// prefers-reduced-motion is handled globally: the existing rule in globals.css
// collapses animation-duration to 0.01ms, degrading the shimmer to a static
// grey block without any additional code here.
'use client';

import { CSSProperties } from 'react';

interface SkeletonProps {
  /** Width of the skeleton block. Number = px. String = any CSS unit. Default: '100%'. */
  width?: string | number;
  /** Height of the skeleton block. Number = px. String = any CSS unit. Default: 16. */
  height?: string | number;
  /** Additional CSS class names. */
  className?: string;
  /** Additional inline styles. */
  style?: CSSProperties;
}

/**
 * Skeleton — shimmer placeholder that matches the shape of the content it replaces.
 * Replaces spinners on loading states across the adult reader surfaces.
 *
 * The shimmer animation lives in globals.css (.vp-skeleton) and is automatically
 * collapsed by the site-wide prefers-reduced-motion rule — no extra work here.
 *
 * @example
 * // 3 skeleton rows simulating comment lines
 * <Skeleton height={20} width="85%" />
 * <Skeleton height={20} width="65%" />
 * <Skeleton height={20} width="75%" />
 */
export default function Skeleton({ width = '100%', height = 16, className, style }: SkeletonProps) {
  const inlineStyle: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return (
    <span
      aria-hidden="true"
      className={`vp-skeleton${className ? ` ${className}` : ''}`}
      style={inlineStyle}
    />
  );
}
