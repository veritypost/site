export default function TermsPage() {
  const sectionStyle = { marginBottom: '32px' };
  const headingStyle = { fontSize: '18px', fontWeight: '700', color: '#111111', marginBottom: '12px', marginTop: '0' };
  const listStyle = { margin: '0', paddingLeft: '20px', fontSize: '14px', color: '#111111', lineHeight: '1.8' };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#111111', letterSpacing: '-0.5px' }}>Verity Post</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111111', margin: '16px 0 4px' }}>Terms of Service</h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Last updated: April 1, 2026</div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Account Terms</h2>
          <ul style={listStyle}>
            <li>You must provide a valid email address and accurate information when creating an account.</li>
            <li>You are responsible for maintaining the security of your account credentials and all activity under your account.</li>
            <li>One person may not maintain more than one account. Automated or bot accounts are not permitted.</li>
            <li>You must be at least 13 years of age to create an account. Users under 18 may be subject to additional restrictions.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Content & Conduct</h2>
          <ul style={listStyle}>
            <li>You retain ownership of content you submit but grant Verity Post a license to display, distribute, and promote it on the platform.</li>
            <li>You may not post content that is deliberately misleading, defamatory, hateful, or that violates any applicable law.</li>
            <li>Verity Scores and fact-check labels are generated through community review and editorial processes and do not constitute legal findings of fact.</li>
            <li>Abuse of the Verity Score system, including coordinated manipulation, will result in account suspension.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Subscriptions & Payments</h2>
          <ul style={listStyle}>
            <li>Verity Post offers free and paid subscription tiers. Paid features are clearly labeled throughout the platform.</li>
            <li>Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current billing period.</li>
            <li>Refunds are available within 7 days of purchase if no paid content has been accessed.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Children & Minors</h2>
          <ul style={listStyle}>
            <li>Users aged 13 to 17 may use Verity Post with parental consent. A dedicated Kids Mode provides age-appropriate content.</li>
            <li>Parents and guardians may manage child accounts, including content filters and usage limits, through the Family Dashboard.</li>
            <li>We do not knowingly collect personal information from children under 13 without verifiable parental consent.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Intellectual Property</h2>
          <ul style={listStyle}>
            <li>The Verity Post name, logo, and platform design are proprietary and may not be used without written permission.</li>
            <li>News content aggregated from third-party sources remains the property of the original publishers and is displayed under fair use principles.</li>
            <li>User-generated analyses, fact-checks, and comments remain the intellectual property of their authors.</li>
            <li>You may not scrape, reproduce, or redistribute Verity Post content or data without authorization.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Disclaimers</h2>
          <ul style={listStyle}>
            <li>Verity Post is provided "as is" without warranties of any kind, express or implied.</li>
            <li>We do not guarantee the accuracy, completeness, or reliability of any content, including Verity Scores and AI-generated summaries.</li>
            <li>Verity Post is not a legal, medical, or financial advisory service. Content should not be relied upon as professional advice.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Termination</h2>
          <ul style={listStyle}>
            <li>We reserve the right to suspend or terminate accounts that violate these terms, with or without prior notice.</li>
            <li>You may delete your account at any time through your account settings. Deletion is permanent and cannot be reversed.</li>
            <li>Upon termination, your right to access the platform ceases immediately, though certain provisions of these terms survive.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Changes to Terms</h2>
          <ul style={listStyle}>
            <li>We may modify these terms at any time. Material changes will be communicated via email or in-app notification at least 30 days in advance.</li>
            <li>Continued use of Verity Post after changes take effect constitutes acceptance of the revised terms.</li>
            <li>If you do not agree with updated terms, you may close your account before the changes take effect.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
