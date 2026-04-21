// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
import type { CSSProperties } from 'react';

export default function PrivacyPage() {
  const sectionStyle: CSSProperties = { marginBottom: '32px' };
  const headingStyle: CSSProperties = { fontSize: '18px', fontWeight: 700, color: '#111111', marginBottom: '12px', marginTop: '0' };
  const listStyle: CSSProperties = { margin: '0', paddingLeft: '20px', fontSize: '14px', color: '#111111', lineHeight: '1.8' };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>Privacy Policy</h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Last updated: April 1, 2026</div>
        </div>

        <div style={sectionStyle}>
          <p style={{ fontSize: '14px', color: '#111111', lineHeight: '1.8', margin: 0 }}>
            Verity Post is operated by Verity Post LLC, which acts as the data controller for personal information processed through the platform. This policy explains what we collect, how we use it, and your rights.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Data We Collect</h2>
          <ul style={listStyle}>
            <li>Account information: email address, username, password hash, and profile details you choose to provide.</li>
            <li>Usage data: pages visited, articles read, quiz scores, Verity Score interactions, and time spent on content.</li>
            <li>Device information: browser type, operating system, IP address, and device identifiers for security purposes.</li>
            <li>Communications: messages sent through the platform and support ticket content.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. How We Use It</h2>
          <ul style={listStyle}>
            <li>To provide, maintain, and improve the Verity Post platform and personalize your experience.</li>
            <li>To calculate Verity Scores, generate recommendations, and power community features.</li>
            <li>To detect and prevent fraud, abuse, and violations of our terms of service.</li>
            <li>To send transactional emails, security alerts, and optional newsletter communications.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Content Processing</h2>
          <ul style={listStyle}>
            <li>We process articles to generate summaries, quiz questions, and content analysis under human editorial oversight.</li>
            <li>Your reading patterns may be used in aggregate to inform recommendation features, and individual data is anonymized before use.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Sharing & Third Parties</h2>
          <ul style={listStyle}>
            <li>We do not sell your personal data to third parties for advertising or marketing purposes.</li>
            <li>We may share anonymized, aggregate data with research partners studying media literacy and misinformation.</li>
            <li>We use essential service providers (hosting, email delivery, payment processing) who are bound by data protection agreements.</li>
            <li>We may disclose information when required by law or to protect the safety of our users.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Data Retention</h2>
          <ul style={listStyle}>
            <li>Account data is retained for as long as your account is active. You may request deletion at any time.</li>
            <li>After account deletion, personal data is purged within 30 days, except where retention is required by law.</li>
            <li>Anonymized usage data may be retained indefinitely for research and platform improvement.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. COPPA Compliance</h2>
          <ul style={listStyle}>
            <li>We do not knowingly collect personal information from children under 13 without verifiable parental consent.</li>
            <li>Kids Mode collects minimal data and does not enable social features or public profile creation.</li>
            <li>Parents may review, modify, or delete their child&apos;s data by contacting legal@veritypost.com.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Your Rights</h2>
          <ul style={listStyle}>
            <li>You may access, correct, or delete your personal data at any time through your account settings.</li>
            <li>You may opt out of non-essential communications and data processing for recommendation purposes.</li>
            <li>California residents may exercise additional rights under the CCPA. EU residents are protected under GDPR.</li>
            <li>To exercise any data rights, contact legal@veritypost.com or use the in-app privacy controls.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Contact</h2>
          <ul style={listStyle}>
            <li>Verity Post is operated by Verity Post LLC.</li>
            <li>For privacy and data protection inquiries: legal@veritypost.com</li>
            <li>For general questions: support@veritypost.com</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
