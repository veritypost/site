// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
import Link from 'next/link';

interface Step {
  number: string;
  title: string;
  description: string;
  color: string;
}

export default function HowItWorksPage() {
  const steps: Step[] = [
    {
      number: '1',
      title: 'Read',
      description:
        'Browse curated news articles from hundreds of verified sources. Every article includes a Verity Score, source transparency data, and AI-generated summaries so you can quickly understand the key facts.',
      color: '#111111',
    },
    {
      number: '2',
      title: 'Quiz',
      description:
        'Test your understanding with short comprehension quizzes after each article. Quizzes are designed to reinforce critical thinking and help you distinguish facts from opinions, claims from evidence.',
      color: '#34d399',
    },
    {
      number: '3',
      title: 'Discuss',
      description:
        'Join moderated discussions where ideas are ranked by quality, not volume. Contribute fact-checks, share additional sources, and engage in constructive debate with other informed readers.',
      color: '#f59e0b',
    },
    {
      number: '4',
      title: 'Earn',
      description:
        'Build your Verity Score by reading thoroughly, acing quizzes, contributing quality discussions, and verifying sources. Higher scores unlock expert features and community recognition.',
      color: '#f472b6',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>
            How It Works
          </h1>
          <p
            style={{
              fontSize: '16px',
              color: '#666666',
              margin: '0',
              maxWidth: '400px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Verity Post helps you become a more informed reader through a simple four-step process.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '40px',
            flexWrap: 'wrap',
          }}
        >
          {steps.map((s) => (
            <div key={s.number} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: s.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              >
                {s.number}
              </div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#111111' }}>{s.title}</span>
              {s.number !== '4' && <span style={{ color: '#e5e5e5', margin: '0 4px' }}>{'>'}</span>}
            </div>
          ))}
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}
        >
          {steps.map((s) => (
            <div
              key={s.number}
              style={{
                background: '#f7f7f7',
                border: '1px solid #e5e5e5',
                borderRadius: '12px',
                padding: '24px',
                borderLeft: '4px solid ' + s.color,
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: s.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '18px',
                    fontWeight: 700,
                  }}
                >
                  {s.number}
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111111', margin: '0' }}>
                  {s.title}
                </h2>
              </div>
              <p style={{ fontSize: '14px', color: '#666666', lineHeight: '1.7', margin: '0' }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link
            href="/signup"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: '#111111',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
