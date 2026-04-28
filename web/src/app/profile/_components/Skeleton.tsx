// Sized loading shapes. One shimmer animation, three semantic shapes. Used
// in place of spinners — bigger perceived speed, clearer content shape.

'use client';

import { C, R } from '../_lib/palette';

const KEYFRAMES_ID = 'redesign-skeleton-shimmer';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes redesign-skeleton-shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
  `;
  document.head.appendChild(style);
}

const baseStyle: React.CSSProperties = {
  display: 'inline-block',
  background: `linear-gradient(90deg, ${C.surfaceSunken} 0%, ${C.divider} 50%, ${C.surfaceSunken} 100%)`,
  backgroundSize: '800px 100%',
  animation: 'redesign-skeleton-shimmer 1.4s ease-in-out infinite',
};

export function SkeletonLine({
  width = '100%',
  height = 14,
  radius = R.sm,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: React.CSSProperties;
}) {
  ensureKeyframes();
  return (
    <span
      aria-hidden
      style={{
        ...baseStyle,
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonBlock({
  height = 80,
  radius = R.lg,
  style,
}: {
  height?: number;
  radius?: number;
  style?: React.CSSProperties;
}) {
  ensureKeyframes();
  return (
    <div
      aria-hidden
      style={{
        ...baseStyle,
        width: '100%',
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  ensureKeyframes();
  return (
    <span
      aria-hidden
      style={{
        ...baseStyle,
        width: size,
        height: size,
        borderRadius: '50%',
      }}
    />
  );
}
