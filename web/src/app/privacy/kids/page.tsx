// @feature-verified shared_pages 2026-04-27
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kids Privacy Notice — Verity Post',
  description:
    'What Verity Post collects from children using Verity Post Kids, why we collect it, and how parents can review or delete it.',
};

export default function KidsPrivacyPage() {
  const sectionStyle: CSSProperties = { marginBottom: '32px' };
  const headingStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111111',
    marginBottom: '12px',
    marginTop: '0',
  };
  const listStyle: CSSProperties = {
    margin: '0',
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#111111',
    lineHeight: '1.8',
  };
  const paragraphStyle: CSSProperties = {
    fontSize: '14px',
    color: '#111111',
    lineHeight: '1.8',
    margin: 0,
  };
  const linkStyle: CSSProperties = {
    color: '#2563eb',
    textDecoration: 'underline',
  };
  const codeStyle: CSSProperties = {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: '13px',
    background: '#f3f4f6',
    padding: '1px 4px',
    borderRadius: 3,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>
            Kids Privacy Notice
          </h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Last updated: April 27, 2026</div>
        </div>

        <div style={sectionStyle}>
          <p style={paragraphStyle}>
            This Kids Privacy Notice explains what data we collect from children using Verity Post Kids,
            why we collect it, and how parents can review or delete it. This applies in addition to
            our main{' '}
            <a href="/privacy" style={linkStyle}>
              Privacy Policy
            </a>{' '}
            where compatible; where the two differ, this notice controls for kid profiles.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. What we collect from a kid profile</h2>
          <ul style={listStyle}>
            <li>
              <code style={codeStyle}>display_name</code> — the kid&apos;s chosen first name or
              nickname (no last name required).
            </li>
            <li>
              <code style={codeStyle}>date_of_birth</code> — for age-tier routing only; never
              displayed publicly.
            </li>
            <li>
              <code style={codeStyle}>parent_user_id</code> — pairing reference to the supervising
              adult account.
            </li>
            <li>Reading log — articles opened by the kid profile, timestamps, time-on-page.</li>
            <li>Quiz attempts — questions answered, correctness, attempt count.</li>
            <li>Achievement progress — badges earned, streak counters.</li>
            <li>
              Device technical data — same minimum the adult app collects (OS version, app build);
              no device name, no advertising ID.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. What we do NOT collect</h2>
          <ul style={listStyle}>
            <li>No real name beyond the optional display_name.</li>
            <li>No email, phone number, or street address from the kid.</li>
            <li>No precise geolocation.</li>
            <li>No biometric or photographic data.</li>
            <li>No third-party analytics, advertising, or tracking SDKs.</li>
            <li>No social features — no DMs, no public profile, no follow graph.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Parental Verifiable Consent (VPC)</h2>
          <ul style={listStyle}>
            <li>
              Pairing flow: parent generates a pair code from the adult app or web; kid enters it in
              the kids app. The pair code redemption is logged with timestamp, parent user ID, and
              IP address.
            </li>
            <li>
              We are evaluating additional VPC mechanisms (knowledge-based authentication,
              payment-method re-verification) for an upcoming release; the current pair-code-only
              mechanism is documented at{' '}
              <code style={codeStyle}>
                parental_consents.consent_method = &apos;pair_code_redeem_v1&apos;
              </code>
              .
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Parental rights</h2>
          <ul style={listStyle}>
            <li>
              Review: parents can review reading log, quiz attempts, and achievement data via the
              parent dashboard at <code style={codeStyle}>/profile/kids/&lt;id&gt;</code>.
            </li>
            <li>
              Delete: parents can delete a kid profile at any time. Deletion soft-flags the profile;
              data is hard-purged from <code style={codeStyle}>kid_profiles</code>,{' '}
              <code style={codeStyle}>reading_log</code>,{' '}
              <code style={codeStyle}>quiz_attempts</code>, and{' '}
              <code style={codeStyle}>user_achievements</code> after a 30-day grace window.
            </li>
            <li>
              Export: data export is available on request via{' '}
              <a href="mailto:legal@veritypost.com" style={linkStyle}>
                legal@veritypost.com
              </a>
              .
            </li>
            <li>
              Refuse further collection: parents can pause a kid profile to stop new data
              collection; existing data is retained until deletion.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Retention</h2>
          <ul style={listStyle}>
            <li>Active kid profile: data retained while profile is active.</li>
            <li>Soft-deleted kid profile: 30-day grace, then hard-purge.</li>
            <li>
              Aggregate, anonymized usage stats may be retained indefinitely for product improvement
              (no re-identifiable data).
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. No third-party sharing</h2>
          <ul style={listStyle}>
            <li>We don&apos;t sell or share kid data for advertising.</li>
            <li>
              We use essential service providers (hosting, push notification delivery) under
              data-protection agreements; no analytics or ad SDKs in the kids app.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Contact</h2>
          <ul style={listStyle}>
            <li>
              For questions or to exercise rights, email{' '}
              <a href="mailto:legal@veritypost.com" style={linkStyle}>
                legal@veritypost.com
              </a>{' '}
              with the subject &quot;Kids Privacy Request.&quot; We respond within 14 days.
            </li>
            <li>This notice was last updated: 2026-04-27.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
