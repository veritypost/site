import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — Verity Post',
  description: 'Verity Post is a news platform where the discussion section is earned. Operated by Verity Post LLC.',
};

export default function AboutPage() {
  const sectionStyle: CSSProperties = { marginBottom: '32px' };
  const headingStyle: CSSProperties = { fontSize: '18px', fontWeight: 700, color: '#111111', marginBottom: '12px', marginTop: '0' };
  const textStyle: CSSProperties = { fontSize: '14px', color: '#111111', lineHeight: '1.8', margin: 0 };
  const linkStyle: CSSProperties = { color: '#111111', textDecoration: 'underline' };

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>{title}</h2>
      {children}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>About Verity Post</h1>
          <div style={{ fontSize: '13px', color: '#666666' }}>Read. Prove it. Discuss.</div>
        </div>

        <Section title="What we are">
          <p style={textStyle}>
            Verity Post is a news platform where the discussion section is earned. Every article has a short comprehension quiz, and commenters unlock the discussion by showing they read the piece. The goal is a comment section worth reading — one where every voice in the thread has demonstrably engaged with the article first.
          </p>
        </Section>

        <Section title="What we publish">
          <p style={textStyle}>
            We cover general news across categories including politics, business, science, health, world, and technology. Each article is paired with editor-reviewed context, a comprehension quiz, and a community-moderated discussion. We offer free reading for everyone and paid subscription tiers that add features like unlimited bookmarks, ad-free reading, and expert question-and-answer access.
          </p>
        </Section>

        <Section title="Company">
          <p style={textStyle}>
            Verity Post is operated by <strong>Verity Post LLC</strong>, a United States limited liability company. Verity Post LLC owns and operates the Verity Post website, the Verity Post iOS application, and the Verity Post Kids iOS application.
          </p>
        </Section>

        <Section title="Contact">
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#111111', lineHeight: '1.8' }}>
            <li>General support: <a href="mailto:support@veritypost.com" style={linkStyle}>support@veritypost.com</a></li>
            <li>Legal and privacy: <a href="mailto:legal@veritypost.com" style={linkStyle}>legal@veritypost.com</a></li>
            <li>Press inquiries: <a href="mailto:support@veritypost.com" style={linkStyle}>support@veritypost.com</a></li>
          </ul>
        </Section>

        <Section title="Policies">
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#111111', lineHeight: '1.8' }}>
            <li><a href="/terms" style={linkStyle}>Terms of Service</a></li>
            <li><a href="/privacy" style={linkStyle}>Privacy Policy</a></li>
            <li><a href="/cookies" style={linkStyle}>Cookie Policy</a></li>
            <li><a href="/accessibility" style={linkStyle}>Accessibility Statement</a></li>
            <li><a href="/dmca" style={linkStyle}>DMCA</a></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
