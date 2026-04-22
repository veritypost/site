// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility — Verity Post',
  description: "Verity Post's commitment to accessibility and how to request support.",
};

export default function AccessibilityPage() {
  const sectionStyle: CSSProperties = { marginBottom: '32px' };
  const headingStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111111',
    marginBottom: '12px',
    marginTop: '0',
  };
  const textStyle: CSSProperties = {
    fontSize: '14px',
    color: '#111111',
    lineHeight: '1.8',
    margin: '0 0 12px 0',
  };
  const listStyle: CSSProperties = {
    margin: '0 0 12px 0',
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#111111',
    lineHeight: '1.8',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>
            Accessibility Statement
          </h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Last updated: April 1, 2026</div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Our Commitment</h2>
          <p style={textStyle}>
            Verity Post is committed to ensuring digital accessibility for people of all abilities.
            We are continually improving the user experience for everyone and applying the relevant
            accessibility standards. We strive to conform to WCAG 2.1 Level AA guidelines.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Accessibility Features</h2>

          <div
            style={{
              background: '#f7f7f7',
              border: '1px solid #e5e5e5',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '10px',
            }}
          >
            <h3
              style={{ fontSize: '15px', fontWeight: 600, color: '#111111', margin: '0 0 6px 0' }}
            >
              Text Resize
            </h3>
            <p style={{ fontSize: '13px', color: '#666666', margin: '0' }}>
              All text on the platform can be resized up to 200% without loss of content or
              functionality. Use your browser zoom or our built-in text size controls in account
              settings.
            </p>
          </div>

          <div
            style={{
              background: '#f7f7f7',
              border: '1px solid #e5e5e5',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '10px',
            }}
          >
            <h3
              style={{ fontSize: '15px', fontWeight: 600, color: '#111111', margin: '0 0 6px 0' }}
            >
              High Contrast Mode
            </h3>
            <p style={{ fontSize: '13px', color: '#666666', margin: '0' }}>
              A high contrast theme is available that increases the contrast ratio of all text and
              UI elements to meet or exceed a 7:1 ratio. Enable it in your display settings.
            </p>
          </div>

          <div
            style={{
              background: '#f7f7f7',
              border: '1px solid #e5e5e5',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '10px',
            }}
          >
            <h3
              style={{ fontSize: '15px', fontWeight: 600, color: '#111111', margin: '0 0 6px 0' }}
            >
              Screen Reader Support
            </h3>
            <p style={{ fontSize: '13px', color: '#666666', margin: '0' }}>
              Verity Post is built with semantic HTML and ARIA labels to ensure compatibility with
              popular screen readers including VoiceOver, NVDA, and JAWS. Images include descriptive
              alt text.
            </p>
          </div>

          <div
            style={{
              background: '#f7f7f7',
              border: '1px solid #e5e5e5',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '10px',
            }}
          >
            <h3
              style={{ fontSize: '15px', fontWeight: 600, color: '#111111', margin: '0 0 6px 0' }}
            >
              Keyboard Navigation
            </h3>
            <p style={{ fontSize: '13px', color: '#666666', margin: '0' }}>
              All interactive elements are accessible via keyboard. Focus indicators are visible and
              follow a logical tab order. Skip-to-content links are provided on every page.
            </p>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Known Limitations</h2>
          <ul style={listStyle}>
            <li>
              Some third-party embedded content (videos, social media posts) may not fully meet
              accessibility standards.
            </li>
            <li>
              Older PDF documents linked from articles may not be fully screen-reader compatible.
            </li>
            <li>
              We are actively working to address these limitations and improve accessibility across
              all content.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Feedback & Contact</h2>
          <p style={textStyle}>
            If you encounter accessibility barriers, contact support@veritypost.com.
          </p>
        </div>
      </div>
    </div>
  );
}
