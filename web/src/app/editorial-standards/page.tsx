// S7-F2 — public editorial standards page.
//
// Per Q4.19 owner-lock: trust-transparency surface; launch-blocker.
// Documents the AR1 architectural intent for public consumption —
// closes the loop between the provenance pill on each article and
// what it means.
//
// Per memory `project_ai_role_intent_correction`: AI assists human
// authors. AI does NOT write articles end-to-end. The "Editorial role
// of AI" section spells out the concrete role.
//
// Includes a `<section id="methodology">` so /methodology can redirect
// here (or render its own page if/when content depth justifies a split
// — see /methodology/page.tsx for the current routing).

import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Editorial Standards — ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} commissions, verifies, corrects, and publishes news. Includes the editorial role of AI, source standards, and conflict of interest policy.`,
  robots: { index: true, follow: true },
};

export default function EditorialStandardsPage() {
  const sectionStyle: React.CSSProperties = { marginBottom: 32 };
  const headingStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: '#111',
    margin: '0 0 12px',
  };
  const bodyStyle: React.CSSProperties = {
    fontSize: 14,
    color: '#222',
    lineHeight: 1.8,
    margin: '0 0 12px',
  };
  const linkStyle: React.CSSProperties = { color: '#111', fontWeight: 600 };

  return (
    <main style={{ minHeight: '100vh', background: '#fff', padding: 20 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#111',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Editorial Standards
        </h1>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 32px' }}>Last updated: April 2026</p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Editorial role of AI</h2>
          <p style={bodyStyle}>
            {BRAND_NAME} uses AI as a research and drafting assistant. AI tools cluster sources,
            extract facts from primary documents, and produce summary drafts. Every article that
            ships under {BRAND_NAME} is reviewed and approved by a human contributor before
            publication.
          </p>
          <p style={bodyStyle}>
            AI does not author articles end-to-end. Where an article was synthesized with
            substantial AI contribution, the byline reads &ldquo;Compiled by {BRAND_NAME}&rdquo;
            (or &ldquo;Verified by &lt;name&gt;&rdquo; when reviewed by a named human verifier),
            and a disclosure pill appears at the top of the article surface. Both signals are
            machine-readable via{' '}
            <code style={{ fontFamily: 'monospace' }}>schema.org creativeWorkStatus</code> and a{' '}
            <code style={{ fontFamily: 'monospace' }}>&lt;meta name=&ldquo;ai-generated&rdquo;&gt;</code>{' '}
            tag, in line with EU AI Act Article 50 and CA AB 2655.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Provenance pill</h2>
          <p style={bodyStyle}>
            Each article carries a provenance pill near the byline. The pill exposes whether AI
            assistance was used and identifies the human verifier of record when one is assigned.
            Difficulty level and reading time are also surfaced so readers can budget attention
            before opening an article.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Corrections policy</h2>
          <p style={bodyStyle}>
            Errors found after publication are corrected in place when factual; serious errors
            trigger a retraction with a public notice on the{' '}
            <Link href="/corrections" style={linkStyle}>
              corrections page
            </Link>
            . The corrections register is the canonical record — articles are not silently
            rewritten.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Verification process</h2>
          <p style={bodyStyle}>
            A &ldquo;Verified by&rdquo; byline indicates a named human reviewer with subject-matter
            expertise has signed off on the article. Verifiers are vetted contributors with a
            publicly visible profile. The application path for prospective verifiers is{' '}
            <Link href="/signup/expert" style={linkStyle}>
              /signup/expert
            </Link>
            .
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Source standards</h2>
          <p style={bodyStyle}>
            Sources cited in {BRAND_NAME} articles must meet a minimum trust threshold (primary
            documents, named human sources, or established outlets with public correction policies).
            Each source carries a trust score visible inline in the source list on every article.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Conflict of interest</h2>
          <p style={bodyStyle}>
            Contributors disclose financial, personal, and professional relationships that bear on
            their reporting. Disclosures appear on the article surface alongside the byline. A
            contributor who cannot disclose a material conflict may not publish on the affected
            topic.
          </p>
        </div>

        <div style={sectionStyle} id="methodology">
          <h2 style={headingStyle}>7. Methodology</h2>
          <p style={bodyStyle}>
            <strong>AI pipeline.</strong> The drafting pipeline retrieves source documents, ranks
            them by trust score, clusters by topic, and generates a structured draft. The draft is
            queued for human review before any publish step. Pipeline runs are logged and
            inspectable by the editorial team.
          </p>
          <p style={bodyStyle}>
            <strong>Verity score.</strong> Reader Verity Scores reflect comprehension (quiz
            performance) and contribution quality. The score is a behaviour signal, not an
            authority signal — it does not gate access to facts.
          </p>
          <p style={bodyStyle}>
            <strong>Source trust score.</strong> Per-source scores combine the publisher&rsquo;s
            historical correction rate, primary-source ratio, and editorial transparency. The score
            is rendered inline next to each source in the article&rsquo;s source list.
          </p>
          <p style={bodyStyle}>
            <strong>Comprehension quizzes.</strong> Articles include a quiz designed to verify the
            reader engaged with the content, not to test memorization. Passing the quiz unlocks the
            article&rsquo;s discussion thread; the quiz is the wedge that keeps discussion grounded
            in what was written.
          </p>
        </div>

        <div style={{ marginTop: 32, fontSize: 13, color: '#666' }}>
          Concerns about a specific article? Email{' '}
          <a href="mailto:legal@veritypost.com" style={linkStyle}>
            legal@veritypost.com
          </a>
          .
        </div>
      </div>
    </main>
  );
}
