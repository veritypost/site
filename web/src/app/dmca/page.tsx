// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
import type { CSSProperties } from 'react';

export default function DMCAPage() {
  const sectionStyle: CSSProperties = { marginBottom: '32px' };
  const headingStyle: CSSProperties = { fontSize: '18px', fontWeight: 700, color: '#111111', marginBottom: '12px', marginTop: '0' };
  const textStyle: CSSProperties = { fontSize: '14px', color: '#111111', lineHeight: '1.8', margin: '0 0 12px 0' };
  const listStyle: CSSProperties = { margin: '0 0 12px 0', paddingLeft: '20px', fontSize: '14px', color: '#111111', lineHeight: '1.8' };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>DMCA Policy</h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Last updated: April 1, 2026</div>
        </div>

        <div style={sectionStyle}>
          <p style={textStyle}>Verity Post respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 (DMCA), we will respond promptly to claims of copyright infringement.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Filing a Takedown Notice</h2>
          <p style={textStyle}>If you believe your copyrighted work has been copied in a way that constitutes infringement, please provide the following information to our designated agent:</p>
          <ul style={listStyle}>
            <li>A physical or electronic signature of the copyright owner or authorized agent.</li>
            <li>Identification of the copyrighted work claimed to have been infringed.</li>
            <li>Identification of the material that is claimed to be infringing, with enough detail to locate it on our platform (e.g., a URL).</li>
            <li>Your contact information, including name, address, telephone number, and email address.</li>
            <li>A statement that you have a good faith belief that the use is not authorized by the copyright owner, its agent, or the law.</li>
            <li>A statement, made under penalty of perjury, that the information in the notification is accurate and that you are the copyright owner or authorized to act on their behalf.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Counter-Notice</h2>
          <p style={textStyle}>If you believe your content was removed in error, you may file a counter-notice containing:</p>
          <ul style={listStyle}>
            <li>Your physical or electronic signature.</li>
            <li>Identification of the material that has been removed and the location where it appeared before removal.</li>
            <li>A statement under penalty of perjury that you have a good faith belief the material was removed by mistake or misidentification.</li>
            <li>Your name, address, and telephone number, and a statement consenting to the jurisdiction of the federal court in your district.</li>
          </ul>
          <p style={textStyle}>Upon receiving a valid counter-notice, we will forward it to the original complainant and restore the material within 10 to 14 business days unless the complainant files a court action.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Repeat Infringer Policy</h2>
          <p style={textStyle}>Verity Post maintains a policy of terminating accounts of users who are repeat copyright infringers. Users who receive three valid DMCA takedown notices will have their accounts permanently suspended.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Contact</h2>
          <p style={textStyle}>Send DMCA notices and counter-notices to legal@veritypost.com.</p>
        </div>
      </div>
    </div>
  );
}
