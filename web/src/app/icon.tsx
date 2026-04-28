// File-based favicon generator. Next.js renders this on build into a
// 32×32 PNG served at `/icon`. It also auto-injects the corresponding
// <link rel="icon"> tag — no manual wiring in layout.js.
//
// Placeholder: solid black background + white "V" wordmark. Replaces
// the no-icon situation that previously made every browser tab show
// the default page glyph. Real artwork ships when owner provides PNGs;
// this file becomes a one-line replacement (or gets deleted in favor
// of /favicon.ico under app/) at that point.

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 22,
          fontWeight: 800,
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '-0.05em',
        }}
      >
        V
      </div>
    ),
    size,
  );
}
