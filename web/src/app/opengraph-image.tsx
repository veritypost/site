// File-based OG image. Next.js renders this into a 1200×630 PNG served
// at `/opengraph-image` and injects og:image + twitter:image tags
// site-wide unless a route overrides with its own opengraph-image file.
//
// Placeholder: brand wordmark on a dark background. Without this every
// social unfurl (Slack, iMessage, Twitter, Facebook) shows the bare URL
// with no preview card — a "test deployment" signal for any reviewer.
// Real artwork is a one-line replacement.

import { ImageResponse } from 'next/og';
import { BRAND_NAME } from '../lib/brand';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${BRAND_NAME}`;

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111111',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 128,
            fontWeight: 800,
            letterSpacing: '-0.04em',
          }}
        >
          {BRAND_NAME}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            fontWeight: 500,
            color: '#999999',
            letterSpacing: '-0.01em',
          }}
        >
          News with a comprehension quiz.
        </div>
      </div>
    ),
    size,
  );
}
