// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy — Verity Post',
  description: 'How Verity Post uses cookies and similar technologies.',
};

export default function CookiesPage() {
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
            Cookie Policy
          </h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Last updated: April 1, 2026</div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>What Are Cookies</h2>
          <p style={textStyle}>
            Cookies are small text files placed on your device when you visit a website. They help
            the site remember your preferences and understand how you interact with the platform.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Essential Cookies</h2>
          <p style={textStyle}>
            These cookies are strictly necessary for the platform to function and cannot be
            disabled.
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Session cookie</strong> - Maintains your login state and CSRF protection.
            </li>
            <li>
              <strong>Preferences cookie</strong> - Stores your theme, language, and accessibility
              settings.
            </li>
            <li>
              <strong>Security cookie</strong> - Helps detect fraudulent activity and protect your
              account.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Analytics Cookies</h2>
          <p style={textStyle}>
            These cookies help us understand how users interact with Verity Post so we can improve
            the experience.
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Page views</strong> - Which pages are visited and how long users spend on
              each.
            </li>
            <li>
              <strong>Feature usage</strong> - Which tools and features are most used (quizzes,
              fact-checks, discussions).
            </li>
            <li>
              <strong>Performance</strong> - Page load times and error rates to identify technical
              issues.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Personalization Cookies</h2>
          <p style={textStyle}>
            These cookies enable content recommendations and personalized features.
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Reading history</strong> - Powers article recommendations and &quot;continue
              reading&quot; features.
            </li>
            <li>
              <strong>Topic preferences</strong> - Remembers your preferred news categories and
              topics.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>How to Manage Cookies</h2>
          <p style={textStyle}>You can manage your cookie preferences at any time:</p>
          <ul style={listStyle}>
            <li>
              Configure your browser settings to block or delete cookies. Most browsers let you
              control cookies on a per-site basis under their Privacy or Security settings. Note
              that blocking essential cookies may prevent the platform from functioning correctly.
            </li>
            <li>
              On mobile devices, you can manage cookies through your device privacy settings or your
              mobile browser&apos;s site-data controls.
            </li>
            <li>
              Visit your account settings to adjust personalization and analytics preferences once
              signed in.
            </li>
            <li>
              An in-app cookie consent banner is coming. Until then, please use the browser-level
              controls above to opt out of non-essential cookies.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Contact</h2>
          <p style={textStyle}>
            For questions about our use of cookies, contact legal@veritypost.com.
          </p>
        </div>
      </div>
    </div>
  );
}
