// File-based Apple touch icon. Next.js renders this into a 180×180 PNG
// served at `/apple-icon` and injects the corresponding
// <link rel="apple-touch-icon"> tag.
//
// Placeholder: solid black background + white "VP" wordmark. Used when
// the site is added to the iOS home screen — without this Apple uses a
// blurred page screenshot and the install reads as half-finished, an
// App Review red flag. Real artwork is a one-line replacement.

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111111',
          color: '#ffffff',
          fontSize: 96,
          fontWeight: 800,
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '-0.05em',
        }}
      >
        VP
      </div>
    ),
    size,
  );
}
